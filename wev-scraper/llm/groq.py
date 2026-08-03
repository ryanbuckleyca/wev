"""Groq provider (OpenAI-compatible chat completions).

Uses the Groq API at https://api.groq.com/openai and requires an API key in
the environment variable GROQ_API_KEY.

Default model: llama-3.3-70b-versatile — Llama 3.3 70B on Groq's LPU inference,
fast and high quality for summarization and structured JSON output.
Context window: 128k tokens.

Free-tier rate limits (confirmed from response headers, 2026-03-06):
  x-ratelimit-limit-requests : 1,000 / hour   ← binding limit for large scrape runs
  x-ratelimit-limit-tokens   : 12,000 / minute
  Reset windows              : requests reset after 1h; tokens reset after ~1s

At ~1,200 tokens per summary call:
  - TPM allows ~10 calls/min → 6s inter-request gap keeps us safely under
  - The hourly 1k request cap is the practical ceiling for large batches:
    a 50-job scrape (50 summaries + 1 values call = 51 requests) uses ~5% of the hour's budget

Strategy for large runs:
  - Summaries: sequential with 6s gap (rate-limited by TPM, not request count)
  - Values: single batch call per run (1 request regardless of job count)
  - Both tasks currently use Groq (see factory.py DEFAULT_MODEL).
  - At 6s/call, 100-job scrape = ~10 min wall time for summaries — acceptable.
  - Hourly cap (1,000 req) only becomes an issue above ~900 jobs in a single hour;
    well outside realistic single-run sizes.

Grounding/search is not supported natively; SSE / org assessment injects shared
Tavily evidence via ``SSEFallbackProvider`` before calling Groq.
"""

from __future__ import annotations

# Import json at the top of the file
import json
import logging
import os
import re
import time
from typing import Optional

import requests

from llm.base import BaseLLMProvider, LLMProviderError
from llm.prompts import (
    build_batch_summary_prompt,
    build_summary_prompt,
    build_summary_system_prompt,
    get_batch_processing_rules,
    get_json_output_rules,
    get_json_system_prompt,
    get_skills_and_values_extraction_rules,
)

GROQ_BASE_URL = "https://api.groq.com/openai"
DEFAULT_MODEL = "llama-3.3-70b-versatile"

logger = logging.getLogger(__name__)

# Groq model hierarchy for fallback (best to worst quality/reliability)
# llama-3.3-70b: best instruction following, 12K TPM, 100K TPD — default
# llama-3.1-8b:  fastest, 14.4K RPD — best for high-volume low-complexity tasks
# qwen3-32b:     reasoning model, 6K TPM, 1K RPD
# kimi-k2:       10K TPM, 1K RPD — last resort
# llama-4-scout: optional; some accounts get model_not_found — keep last
GROQ_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "qwen/qwen3-32b",
    "moonshotai/kimi-k2-instruct-0905",
    "meta-llama/llama-4-scout-17b-16e-instruct",
]

# Rate limiting: enforce a minimum gap between requests to stay under TPM.
# llama-3.3-70b (default): 12K TPM → at ~2K tokens/call, ~6 calls/min → 10s gap is safe.
# llama-4-scout: 30K TPM → could go faster, but 6s is fine for our volumes.
_MIN_REQUEST_INTERVAL = 6.0
_MAX_RETRIES = 8   # enough to wait through several TPM windows (each ~62s)
_RETRY_BASE_DELAY = 15.0


def _strip_org_name(text: str, org_name: str) -> str:
    """Remove org name (and pipe-separated aliases, acronyms) from a summary string."""
    parts: list[str] = []
    # Handle pipe-separated names e.g. "Canadian Geographic | Biinaagami"
    for segment in re.split(r'\s*[|/]\s*', org_name):
        segment = segment.strip()
        if segment:
            parts.append(segment)
            # Also extract bracketed acronym e.g. "CELA" from "... (CELA)"
            m = re.search(r'\(([^)]{2,10})\)', segment)
            if m:
                parts.append(m.group(1))
                base = segment[:m.start()].strip()
                if base:
                    parts.append(base)
    # Sort longest first to avoid partial-match gaps
    parts.sort(key=len, reverse=True)
    result = text
    for part in parts:
        # Escape then replace literal spaces with \s* to be flexible
        loose = re.escape(part).replace(r'\ ', r'\s*')
        pattern = re.compile(r"'?s?\s*" + loose + r"'?s?", re.IGNORECASE)
        result = pattern.sub('', result)
    result = re.sub(r'\s{2,}', ' ', result).strip().strip(',').strip()
    if result and result[0].islower():
        result = result[0].upper() + result[1:]
    return result


class GroqProvider(BaseLLMProvider):
    """Provider using the Groq REST API (OpenAI-compatible chat completions).

    Supports automatic model fallback when rate limits are hit.
    Models are tried in order of quality, falling back to lesser models
    when the preferred model runs out of quota.
    """

    def __init__(self, api_key: Optional[str] = None, **kwargs):
        self._api_key = (api_key or os.environ.get("GROQ_API_KEY", "")).strip()
        if not self._api_key:
            logger.warning(
                "GROQ_API_KEY not set — Groq will be unavailable (no API fallback when Gemini fails)."
            )
        self._base_url = kwargs.get("base_url") or GROQ_BASE_URL
        self._model = kwargs.get("model") or DEFAULT_MODEL
        self._last_request_time: float = 0.0
        self._current_model_index = 0
        self._exhausted_models: set[str] = set()

        # If a specific model is requested, find its index in the hierarchy
        if self._model != DEFAULT_MODEL and self._model in GROQ_MODELS:
            self._current_model_index = GROQ_MODELS.index(self._model)

    def is_available(self) -> bool:
        return bool(self._api_key)

    def _get_next_model(self) -> str | None:
        """Get the next available model in the fallback hierarchy.

        Returns:
            Next model name, or None if all models are exhausted.
        """
        # Try models starting from current position
        for i in range(self._current_model_index, len(GROQ_MODELS)):
            model = GROQ_MODELS[i]
            if model not in self._exhausted_models:
                return model

        # If we've exhausted all from current position, try earlier ones
        for i in range(0, self._current_model_index):
            model = GROQ_MODELS[i]
            if model not in self._exhausted_models:
                return model

        return None

    def _mark_model_exhausted(self, model: str):
        """Mark a model as exhausted and move to the next one."""
        self._exhausted_models.add(model)
        logger.warning(f"[Groq] Model {model} exhausted, trying next model...")
        if self._model == model:
            next_model = self._get_next_model()
            if next_model:
                self._model = next_model
                self._current_model_index = GROQ_MODELS.index(next_model)
                logger.info(f"[Groq] Switched to model: {next_model}")

    def _request(self, path: str, payload: dict, model_override: str | None = None) -> dict:
        elapsed = time.monotonic() - self._last_request_time
        if elapsed < _MIN_REQUEST_INTERVAL:
            time.sleep(_MIN_REQUEST_INTERVAL - elapsed)
        url = self._base_url.rstrip("/") + path
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        # Use the provided model or current model
        current_model = model_override or self._model
        payload["model"] = current_model

        last_err: Exception | None = None
        for attempt in range(_MAX_RETRIES + 1):
            try:
                resp = requests.post(url, json=payload, headers=headers, timeout=120)
            except Exception as e:
                self._last_request_time = time.monotonic()
                raise LLMProviderError(f"Groq request failed: {e}") from e
            self._last_request_time = time.monotonic()

            if resp.status_code == 429:
                resp_text = resp.text[:500].lower()
                # Daily quota exhausted — no point waiting, fall back to next model.
                # TPM (tokens per minute) resets in ~60s — wait and retry the SAME model.
                is_daily_exhausted = "tokens per day" in resp_text or "requests per day" in resp_text
                is_tpm = "tokens per minute" in resp_text
                is_rpm = "requests per minute" in resp_text

                if is_daily_exhausted:
                    self._mark_model_exhausted(current_model)
                    next_model = self._get_next_model()
                    if next_model and next_model != current_model:
                        logger.info(f"[Groq] {current_model} daily quota exhausted, switching to {next_model}")
                        print(f"  [Groq] {current_model} daily quota exhausted → switching to {next_model}", flush=True)
                        payload["model"] = next_model
                        current_model = next_model
                        continue
                    else:
                        raise LLMProviderError(f"All Groq models daily quota exhausted: {resp.text[:200]}")

                # TPM or RPM — wait for the per-minute window to reset, then retry same model
                raw_retry = resp.headers.get("retry-after")
                if raw_retry:
                    wait = min(float(raw_retry), 65.0)
                elif is_tpm or is_rpm:
                    wait = 62.0  # TPM resets every 60s; add 2s buffer
                else:
                    wait = min(_RETRY_BASE_DELAY * (2 ** attempt), 65.0)
                logger.warning(f"  [Groq] 429 rate-limited ({current_model}), waiting {wait:.0f}s (attempt {attempt + 1}/{_MAX_RETRIES})...")
                print(f"  [Groq] TPM/RPM limit hit ({current_model}), waiting {wait:.0f}s...", flush=True)
                time.sleep(wait)
                last_err = LLMProviderError(f"Groq API error (429): {resp.text[:200]}")
                continue
            if not resp.ok:
                if resp.status_code == 413:
                    # Request too large for this model — don't mark exhausted,
                    # just raise so the caller can trim the prompt and retry
                    raise LLMProviderError(
                        f"Groq API error ({resp.status_code}): {resp.text[:400]}"
                    )
                raise LLMProviderError(
                    f"Groq API error ({resp.status_code}): {resp.text[:400]}"
                )
            try:
                return resp.json()
            except Exception as e:
                raise LLMProviderError(f"Failed to parse Groq response: {e}") from e
        raise last_err or LLMProviderError("Groq request failed after retries")

    def complete(
        self,
        prompt: str,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        stop: Optional[list[str]] = None,
        system: Optional[str] = None,
        **kwargs,
    ) -> str:
        json_mode = kwargs.get("json_mode")
        if json_mode is None:
            # Unified post-processor expects a top-level JSON *array*; Groq's json_object
            # mode requires a top-level object and breaks parsing if the model obeys the API.
            json_mode = kwargs.get("task") != "unified"

        messages: list[dict] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        payload: dict = {
            "messages": messages,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        if stop:
            payload["stop"] = stop

        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        temperature = kwargs.get("temperature")
        if temperature is None and kwargs.get("task") == "sse":
            temperature = 0
        if temperature is not None:
            payload["temperature"] = float(temperature)

        # Use the specified model or current model with fallback
        if model and model != self._model:
            # Temporarily use the specified model
            data = self._request("/v1/chat/completions", payload, model_override=model)
        else:
            # Use current model (which may have fallback logic)
            data = self._request("/v1/chat/completions", payload)

        choices = data.get("choices") or []
        if not choices:
            return ""
        return (choices[0].get("message") or {}).get("content", "") or ""

    def get_token_limits(self) -> dict:
        """Return token limits for the current active Groq model.

        Free-tier limits (confirmed from console.groq.com/settings/limits):
          model                    RPM  RPD    TPM    TPD
          llama-4-scout-17b         30   1K    30K   500K
          llama-3.3-70b-versatile   30   1K    12K   100K
          llama-3.1-8b-instant      30  14.4K   6K   500K
          qwen/qwen3-32b            60   1K     6K   500K
          moonshotai/kimi-k2-0905   60   1K    10K   300K

        recommended_batch_size targets ~80% of TPM to leave headroom for
        response tokens and avoid hitting the per-minute cap mid-batch.
        TPD is the daily ceiling — large batches help conserve RPD.
        """
        model = self._model
        if "llama-4-scout" in model:
            return {
                "context_window": 10_000_000,
                "requests_per_minute": 30,
                "requests_per_day": 1_000,
                "tokens_per_minute": 30_000,
                "tokens_per_day": 500_000,
                "max_tokens_per_request": 30_000,
                "recommended_batch_size": 24_000,  # 80% of per-request cap
            }
        elif "llama-3.3-70b" in model:
            return {
                "context_window": 131_072,
                "requests_per_minute": 30,
                "requests_per_day": 1_000,
                "tokens_per_minute": 12_000,
                "tokens_per_day": 100_000,
                "max_tokens_per_request": 12_000,   # hard per-request cap (= TPM on free tier)
                "recommended_batch_size": 9_600,    # 80% of per-request cap
            }
        elif "llama-3.1-8b" in model:
            return {
                "context_window": 131_072,
                "requests_per_minute": 30,
                "requests_per_day": 14_400,
                "tokens_per_minute": 6_000,
                "tokens_per_day": 500_000,
                "max_tokens_per_request": 6_000,
                "recommended_batch_size": 4_800,
            }
        elif "qwen3-32b" in model:
            return {
                "context_window": 32_768,
                "requests_per_minute": 60,
                "requests_per_day": 1_000,
                "tokens_per_minute": 6_000,
                "tokens_per_day": 500_000,
                "max_tokens_per_request": 6_000,
                "recommended_batch_size": 4_800,
            }
        elif "kimi-k2" in model:
            return {
                "context_window": 131_072,
                "requests_per_minute": 60,
                "requests_per_day": 1_000,
                "tokens_per_minute": 10_000,
                "tokens_per_day": 300_000,
                "max_tokens_per_request": 10_000,
                "recommended_batch_size": 8_000,
            }
        else:
            # Safe fallback
            return {
                "context_window": 131_072,
                "requests_per_minute": 30,
                "requests_per_day": 1_000,
                "tokens_per_minute": 6_000,
                "tokens_per_day": 100_000,
                "max_tokens_per_request": 6_000,
                "recommended_batch_size": 4_800,
            }

    def summarize_and_tag_values_batch(self, jobs: list[dict], max_chars: int = 300, max_values: int = 5) -> list[dict]:
        """Extract summary, skills, and values for multiple jobs in a single LLM call.

        Args:
            jobs: List of job dictionaries with job details.
            max_chars: Maximum characters in each summary (default 300).
            max_values: Maximum number of values per job (default 5).

        Returns:
            List of dicts with 'summary', 'skills', and 'values' keys for each job.
        """
        if not jobs:
            return []

        from utils.job_values_prompts import (
            _get_formatted_taxonomy,
            format_job_chunks,
            get_work_values_set,
        )

        # Express length as words — models handle word counts far better than char counts.
        max_words = max(10, max_chars // 6)

        job_chunks = format_job_chunks(jobs, max_desc_chars=4000, include_wage=False)

        # Create batch prompt
        prompt = (
            f"Analyze each job posting and extract three things for each:\n"
            f"{build_batch_summary_prompt(max_words, max_values)}"
            f"{get_skills_and_values_extraction_rules()}\n\n"
            f"{get_batch_processing_rules(max_values)}"
            f"ALLOWED VALUES (label: meaning):\n"
            f"{_get_formatted_taxonomy()}\n\n"
            f"JOBS (1-indexed):\n"
            f"{chr(10).join(job_chunks)}\n\n"
            f"OUTPUT FORMAT (JSON array only, same order as jobs):\n"
            f"[\n"
            f"  {{\n"
            f"    \"index\": 1,\n"
            f"    \"summary\": \"Summary sentence here\",\n"
            f"    \"skills\": [\"skill1\", \"skill2\", \"skill3\"],\n"
            f"    \"values\": [\"Value A\", \"Value B\"]\n"
            f"  }}\n"
            f"]\n\n"
            f"{get_json_output_rules(max_values)}"
        )

        result = self.complete(
            prompt,
            system=get_json_system_prompt(),
        )

        # Parse the batch response
        try:
            import re
            # Extract JSON array
            json_match = re.search(r'\[\s*\{[\s\S]*\}\s*\]', result.strip())
            if not json_match:
                return [{"summary": "", "skills": [], "values": []} for _ in jobs]

            json_str = json_match.group(0)
            parsed = json.loads(json_str)

            if not isinstance(parsed, list):
                return [{"summary": "", "skills": [], "values": []} for _ in jobs]

            # Normalize results to match job count
            results = []

            for i, _job in enumerate(jobs):
                # Find result by index
                job_result = None
                for item in parsed:
                    if isinstance(item, dict) and item.get("index") == i + 1:
                        job_result = item
                        break

                if not job_result:
                    # Try to use positional fallback
                    if i < len(parsed) and isinstance(parsed[i], dict):
                        job_result = parsed[i]
                    else:
                        job_result = {}

                # Extract and clean data
                summary = str(job_result.get("summary", "")).strip()
                skills = job_result.get("skills", [])
                if isinstance(skills, list):
                    skills = [str(skill).strip() for skill in skills if str(skill).strip()]
                else:
                    skills = []

                raw_values = job_result.get("values", [])
                if isinstance(raw_values, list):
                    # Filter values to only include allowed ones
                    values = [str(value).strip() for value in raw_values if str(value).strip() and str(value).strip() in get_work_values_set()]
                else:
                    values = []

                results.append({
                    "summary": summary,
                    "skills": skills,
                    "values": values
                })

            # Ensure we have results for all jobs
            while len(results) < len(jobs):
                results.append({"summary": "", "skills": [], "values": []})

            return results[:len(jobs)]

        except Exception as e:
            logger.error(f"Error parsing batch response: {e}")
            return [{"summary": "", "skills": [], "values": []} for _ in jobs]

    def summarize_and_tag_values(self, text: str, max_chars: int = 300, org_name: str | None = None, job_title: str | None = None) -> dict:
        """Extract summary, skills, and values from job text in a single LLM call.

        Args:
            text: Raw job description text.
            max_chars: Maximum characters in the summary (default 300).
            org_name: Organization name for summary cleaning.
            job_title: Job title for context.

        Returns:
            Dict with 'summary', 'skills', and 'values' keys.
        """
        if not text or not text.strip():
            return {"summary": "", "skills": [], "values": []}

        # Import the values taxonomy
        from utils.job_values_prompts import _get_formatted_taxonomy, get_work_values_set

        # Express length as words — models handle word counts far better than char counts.
        max_words = max(10, max_chars // 6)

        # Comprehensive prompt for all three outputs, using predefined values taxonomy
        prompt = (
            f"Analyze this job posting and extract three things:\n"
            f"{build_batch_summary_prompt(max_words, 5)}"
            f"{get_skills_and_values_extraction_rules()}\n\n"
            f"{get_batch_processing_rules(5)}"
            f"ALLOWED VALUES (label: meaning):\n"
            f"{_get_formatted_taxonomy()}\n\n"
        )

        if job_title:
            prompt += f"Job Title: {job_title}\n"

        prompt += f"Job Description:\n{text[:4000]}"

        result = self.complete(
            prompt,
            system=(
                "Output a JSON object with three keys: 'summary' containing the summary sentence, "
                "'skills' containing an array of skill-related keywords, and 'values' containing an array of work values. "
                "Skills can be free-form keywords, but values must exactly match the allowed labels from the taxonomy. "
                "No preamble, no quotation marks, no explanation, no extra sentences, no markdown. "
                "NEVER use a colon in the summary sentence. "
                "NEVER start with the job title or 'This role'. "
                "NEVER mention any organisation name. "
                "CRITICAL: Match the language of the job posting exactly. "
                "French job titles/descriptions → French summary. English → English. "
                "Look for French words, phrases, and job titles in the posting."
            ),
        )

        # Debug log to capture raw response
        print("[DEBUG] Raw LLM Response:", result.strip())

        # Try to extract JSON from the response

        # Look for a simpler pattern - extract each field separately
        summary_match = re.search(r'summary:\s*([^\n\}]+)', result.strip(), re.IGNORECASE)
        skills_match = re.search(r'skills:\s*\[([^\]]+)\]', result.strip(), re.IGNORECASE | re.DOTALL)
        values_match = re.search(r'values:\s*\[([^\]]+)\]', result.strip(), re.IGNORECASE | re.DOTALL)

        summary = ""
        skills = []
        values = []

        if summary_match:
            summary = summary_match.group(1).strip().rstrip(',').strip()

        if skills_match:
            skills_text = skills_match.group(1).strip()
            # Split by comma and clean up
            skills = [skill.strip().strip('"').strip("'") for skill in skills_text.split(',') if skill.strip()]
            # Remove empty strings and common artifacts
            skills = [skill for skill in skills if skill and skill not in ['[', ']']]

        if values_match:
            values_text = values_match.group(1).strip()
            # Split by comma and clean up
            raw_values = [value.strip().strip('"').strip("'") for value in values_text.split(',') if value.strip()]
            # Filter values to only include allowed ones
            values = [value for value in raw_values if value in get_work_values_set()]

        print(f"[DEBUG] Extracted summary: {repr(summary)}")
        print(f"[DEBUG] Extracted skills: {skills}")
        print(f"[DEBUG] Extracted values: {values}")

        # Post-process the summary
        summary = summary.replace("**", "")
        colon_prefix = re.match(r'^[^.]{1,60}: ', summary)
        if colon_prefix:
            summary = summary[colon_prefix.end():].lstrip()
            if summary:
                summary = summary[0].upper() + summary[1:]
        if org_name:
            summary = _strip_org_name(summary, org_name)
        if len(summary) > max_chars:
            summary = summary[:max_chars].rsplit(None, 1)[0]

        return {"summary": summary, "skills": skills, "values": values}

    def summarize_text(self, text: str, max_chars: int = 300, org_name: str | None = None, job_title: str | None = None) -> str:
        """Summarize a job description in one sentence, up to max_chars.

        Returns just the summary string, consistent with base class contract.
        """
        if not text or not text.strip():
            return ""

        # Express length as words — models handle word counts far better than char counts.
        max_words = max(10, max_chars // 6)

        # Simple, focused prompt for just the summary
        prompt = build_summary_prompt(max_words, job_title=job_title) + f"{text[:4000]}"

        result = self.complete(
            prompt,
            system=build_summary_system_prompt(),
        )

        # Clean up the result and return as string
        summary = result.strip()

        # Remove common artifacts
        summary = summary.replace("**", "")
        summary = summary.replace("*", "")

        # Remove leading prefixes like "Summary: " if present
        if summary.startswith("Summary:"):
            summary = summary[8:].strip()
        elif summary.startswith("summary:"):
            summary = summary[8:].strip()

        # Handle colon prefixes
        colon_prefix = re.match(r'^[^.]{1,60}: ', summary)
        if colon_prefix:
            summary = summary[colon_prefix.end():].lstrip()
            if summary:
                summary = summary[0].upper() + summary[1:]

        # Remove org name if provided
        if org_name:
            summary = _strip_org_name(summary, org_name)

        # Respect max_chars by chopping if necessary
        if len(summary) > max_chars:
            summary = summary[:max_chars].rsplit(None, 1)[0]

        return summary
