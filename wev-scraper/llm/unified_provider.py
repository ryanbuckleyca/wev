"""Unified LLM provider with multi-tier fallback for complete job processing.

Tries backends in order:
  gemini-3.6-flash → gemini-3.5-flash-lite → groq → ollama (when available).
Hard daily/free-tier 429s burn that backend for the process; the run aborts
only once every API backend in the chain has hit one.
When ``ENV_MODE=local``, Ollama is also tried earlier for offline preference on
unified (non-SSE-grounded) batches.

Each call uses ``task=unified``: summary + values + SSE fields are all inferred
from the job text in one JSON payload.

Live **Google Search** in the Gemini SDK is off for ``task=unified`` unless
``FORCE_GROUNDING=1`` — that is independent of whether SSE columns appear in the prompt.
"""

import logging
import os
import time
from typing import Any, Dict, List

from llm.base import BaseLLMProvider, LLMProviderError, error_suggests_try_next_provider
from llm.config import should_use_grounding
from llm.cooldown import (
    DailyQuotaExhaustedError,
    ProviderCooldownMixin,
    get_cooldown_minutes,
    is_daily_quota_exhausted_error,
    is_quota_exhausted_error,
)
from llm.gemini import GeminiProvider
from llm.gemini_fallback import gemini_sse_lite_model, gemini_sse_primary_model
from llm.groq import GroqProvider
from llm.local_grounded import LocalGroundedProvider
from llm.prompts import (
    get_unified_prompt_instructions,
    get_unified_system_prompt,
)
from settings import is_local_env

logger = logging.getLogger(__name__)

# Single prompt shape for every backend: always request SSE *fields* (model infers from text).
UNIFIED_INCLUDE_SSE_FIELDS = True

# Transient Gemini capacity (503 / high demand): retry same model before falling through.
_GEMINI_TRANSIENT_RETRIES = 4
_GEMINI_TRANSIENT_BACKOFF_S = 15.0


def _is_gemini_provider_name(name: str) -> bool:
    return "gemini" in (name or "").lower()




class UnifiedJobProcessor(ProviderCooldownMixin):
    """Unified job processor with intelligent fallback chain."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key
        # Track providers with quota exhaustion and when they can be retried
        self._exhausted_until: dict[str, float] = {}
        self._cooldown_seconds = get_cooldown_minutes() * 60
        # Providers that hit a hard daily/free-tier 429 this process — skip for the rest of the run
        self._daily_quota_exhausted: set[str] = set()

        primary = gemini_sse_primary_model()
        lite = gemini_sse_lite_model()

        # When ENV_MODE=local, prefer Ollama early for unified batches (no API spend).
        local_first = [
            ("ollama", lambda: LocalGroundedProvider(), "Ollama (local LLM)"),
        ] if is_local_env() else []

        skip_groq = os.environ.get("UNIFIED_SKIP_GROQ", "").strip().lower() in (
            "1", "true", "yes", "on",
        )

        candidates = [
            *local_first,
            (primary, lambda: GeminiProvider(api_key=api_key, model=primary), f"Gemini ({primary})"),
            (lite, lambda: GeminiProvider(api_key=api_key, model=lite), f"Gemini ({lite})"),
        ]
        if not skip_groq:
            candidates.append(("groq", lambda: GroqProvider(), "Groq"))
        else:
            logger.warning("Skipping LLM provider groq (UNIFIED_SKIP_GROQ set)")
        # Always append Ollama last when not already first (API-exhausted fallback).
        if not is_local_env():
            candidates.append(
                ("ollama", lambda: LocalGroundedProvider(), "Ollama (local LLM)"),
            )

        enable_local = os.environ.get("ENABLE_LOCAL_FALLBACK", "").strip().lower() in ("1", "true", "yes", "on")

        self.providers = []
        for name, factory, description in candidates:
            if not enable_local and name == "ollama":
                logger.warning("Skipping LLM provider ollama (ENABLE_LOCAL_FALLBACK not set)")
                continue
            try:
                provider = factory()
                if not provider.is_available():
                    logger.warning("Skipping LLM provider %s (not available)", name)
                    continue
                self.providers.append({
                    "name": name,
                    "provider": provider,
                    "description": description,
                })
            except Exception as e:
                logger.warning("Skipping LLM provider %s (not usable): %s", name, e)

        self.last_successful_provider = None

    def _api_provider_names(self) -> list[str]:
        """Backends that count toward 'all models exhausted' (excludes ollama)."""
        return [p["name"] for p in self.providers if p["name"] != "ollama"]

    def _all_api_daily_quotas_exhausted(self) -> bool:
        names = self._api_provider_names()
        return bool(names) and all(n in self._daily_quota_exhausted for n in names)

    def _raise_if_all_daily_quotas_exhausted(self, cause: Exception | None = None) -> None:
        if self._all_api_daily_quotas_exhausted():
            exhausted = self._api_provider_names()
            print(
                "\n🛑 All LLM backends hit daily/free-tier quota — aborting run.\n"
                f"   Exhausted: {', '.join(exhausted)}\n"
                "   Swap GEMINI_API_KEY / GROQ_API_KEY (new projects) or enable billing, then resume.\n",
                flush=True,
            )
            raise DailyQuotaExhaustedError(exhausted, cause)



    def _try_provider(self, provider_info: dict, jobs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Try a specific provider for job processing."""
        provider = provider_info["provider"]
        if not provider.is_available():
            raise LLMProviderError(f"Provider {provider_info['name']} not available")
        try:
            return self._process_with_provider(
                jobs, provider, include_sse=UNIFIED_INCLUDE_SSE_FIELDS,
            )
        except Exception as e:
            logger.warning(f"Provider {provider_info['name']} failed: {e}")
            raise

    def _process_with_provider(self, jobs: List[Dict], provider: BaseLLMProvider, include_sse: bool) -> Dict[str, Any]:
        """Build prompt, call provider, and parse response."""
        prompt = self._build_unified_prompt(jobs, include_sse=include_sse)
        result = provider.complete(
            prompt,
            system=get_unified_system_prompt(include_sse=include_sse),
            task="unified",
        )
        return self._parse_unified_response(result, len(jobs))

    def _build_unified_prompt(self, jobs: List[Dict], include_sse: bool = False) -> str:
        """Build comprehensive prompt for unified processing."""
        from utils.job_values_prompts import _get_formatted_taxonomy, format_job_chunks

        prompt_parts = [
            get_unified_prompt_instructions(include_sse),
            "IMPORTANT: Detect the language of each job posting. Look for French words, phrases, or job titles. If the posting contains French content, you MUST write the summary in French. "
            "If the posting is in French, write your sentence in French. If in English, write in English. "
            "If the posting is written in both English and French, or explicitly requires both languages, "
            "you may write the summary in either language.",
            f"\n\nWORK VALUES TAXONOMY:\n{_get_formatted_taxonomy()}\n",
        ]

        job_chunks = format_job_chunks(jobs, max_desc_chars=8000)
        for chunk in job_chunks:
            prompt_parts.append(f"\n{chunk}")

        fields = "index, summary, language, values, skills_raw, is_sse, sse_confidence" if include_sse else "index, summary, language, values, skills_raw"
        prompt_parts.append(f"\n\nOutput JSON array with objects containing: {fields}")

        return "".join(prompt_parts)

    def _parse_unified_response(self, response: str, expected_jobs: int, max_values: int = 5) -> Dict[str, Any]:
        """Parse the unified response into structured results.

        Handles all LLM output styles:
        - Raw JSON array
        - JSON wrapped in ```json ... ``` or ``` ... ``` fences
        - JSON with leading/trailing prose
        """
        import json
        import re

        from utils.job_values_prompts import get_work_values_set

        VALID_LANGUAGES = frozenset({"en", "fr", "bilingual"})

        def try_parse(text: str):
            text = text.strip()
            # Direct parse
            try:
                result = json.loads(text)
                if isinstance(result, list):
                    return result
            except json.JSONDecodeError:
                pass
            # Extract first [...] block
            match = re.search(r'\[.*\]', text, re.DOTALL)
            if match:
                try:
                    result = json.loads(match.group(0))
                    if isinstance(result, list):
                        return result
                except json.JSONDecodeError:
                    pass
            return None

        def enforce_limits(items: list) -> list:
            """Validate against taxonomy, deduplicate, cap to max_values, and add confidence scores."""
            for item in items:
                if isinstance(item, dict) and isinstance(item.get("values"), list):
                    seen: set = set()
                    deduped: list = []
                    for raw in item["values"]:
                        v = str(raw).strip()
                        if v in get_work_values_set() and v not in seen:
                            seen.add(v)
                            deduped.append(v)
                    values = deduped[:max_values]
                    item["values"] = values
                    item["values_rated"] = [
                        {"value": v, "rank": i + 1} for i, v in enumerate(values)
                    ]
                if isinstance(item, dict) and "language" in item:
                    raw_lang = item.get("language")
                    if not isinstance(raw_lang, str):
                        logger.warning(
                            "Unexpected language value from LLM (not a string): %r — omitting",
                            raw_lang,
                        )
                        item.pop("language", None)
                    else:
                        lang = raw_lang.lower()
                        if lang in VALID_LANGUAGES:
                            item["language"] = lang
                        else:
                            logger.warning(
                                "Unexpected language value from LLM: %r — omitting", lang
                            )
                            item.pop("language", None)
                if isinstance(item, dict) and "skills_raw" in item:
                    raw_skills = item.get("skills_raw")
                    if isinstance(raw_skills, list):
                        valid_skills = [str(s).strip() for s in raw_skills if str(s).strip()]
                        item["skills_raw"] = valid_skills
                    else:
                        logger.warning("Unexpected skills_raw value from LLM (not a list): %r — omitting", raw_skills)
                        item.pop("skills_raw", None)
            return items

        # 1. Try raw response first
        result = try_parse(response)
        if result is not None:
            return {"results": enforce_limits(result), "count": len(result)}

        # 2. Strip markdown fences and retry
        stripped = re.sub(r"^```(?:json)?\s*", "", response.strip(), flags=re.IGNORECASE)
        stripped = re.sub(r"\s*```$", "", stripped.strip())
        result = try_parse(stripped)
        if result is not None:
            return {"results": enforce_limits(result), "count": len(result)}

        logger.error(f"Failed to parse unified response: {response[:200]}...")
        return {"results": [], "count": 0, "error": "Failed to parse response"}

    def process_jobs(self, jobs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Process jobs with intelligent fallback chain, using token-aware batching."""
        if not jobs:
            return {"results": [], "count": 0, "provider": None}

        last_error = None
        attempted_providers = []

        logger.info(f"Processing {len(jobs)} jobs with unified processor")

        for provider_info in self.providers:
            provider_name = provider_info['name']

            # Skip backends that already burned their daily/free-tier quota this run
            if provider_name in self._daily_quota_exhausted:
                attempted_providers.append(f"{provider_name} (daily quota)")
                continue

            # Skip providers in cooldown period after soft RPM/TPM exhaustion
            if self._is_provider_in_cooldown(provider_name):
                attempted_providers.append(f"{provider_name} (cooldown)")
                continue

            attempted_providers.append(provider_name)

            try:
                logger.info(f"🔄 Trying provider: {provider_info['description']} ({provider_name})")
                provider = provider_info["provider"]
                if not provider.is_available():
                    raise LLMProviderError(f"Provider {provider_name} not available")

                system = get_unified_system_prompt(include_sse=UNIFIED_INCLUDE_SSE_FIELDS)

                def build_prompt(batch: List[Dict], _sse: bool = UNIFIED_INCLUDE_SSE_FIELDS) -> str:
                    return self._build_unified_prompt(batch, include_sse=_sse)

                def parse_response(raw: str, batch: List[Dict]) -> List[Any]:
                    parsed = self._parse_unified_response(raw, len(batch))
                    results = parsed.get("results", [])
                    # Pad to batch length if needed
                    while len(results) < len(batch):
                        results.append(None)
                    return results[:len(batch)]

                # On Gemini, retry transient 503/high-demand before falling to the next backend.
                attempts = (
                    _GEMINI_TRANSIENT_RETRIES if _is_gemini_provider_name(provider_name) else 1
                )
                all_results = None
                for attempt in range(attempts):
                    try:
                        all_results = provider.complete_batch(
                            items=jobs,
                            build_prompt=build_prompt,
                            parse_response=parse_response,
                            system=system,
                            task="unified",
                            raise_for_fallback=True,
                        )
                        break
                    except Exception as e:
                        transient = error_suggests_try_next_provider(e)
                        if (
                            transient
                            and _is_gemini_provider_name(provider_name)
                            and attempt < attempts - 1
                            and not is_quota_exhausted_error(e)
                        ):
                            wait = _GEMINI_TRANSIENT_BACKOFF_S * (attempt + 1)
                            logger.warning(
                                "Gemini %s transient error (attempt %s/%s): %s — retrying in %.0fs",
                                provider_name,
                                attempt + 1,
                                attempts,
                                e,
                                wait,
                            )
                            print(
                                f"  ⏳ Gemini busy ({provider_name}), retrying in {wait:.0f}s "
                                f"(attempt {attempt + 1}/{attempts})…",
                                flush=True,
                            )
                            time.sleep(wait)
                            continue
                        raise

                self.last_successful_provider = provider_name
                _gs = should_use_grounding("unified")
                logger.info(
                    "✅ Success with %s: processed %s jobs (google_search_grounding=%s)",
                    provider_name,
                    len(all_results),
                    _gs,
                )

                if attempted_providers[0] != provider_name:
                    logger.info(f"🔄 Fallback successful: {attempted_providers[0]} → {provider_name}")

                return {
                    "results": all_results,
                    "count": len(all_results),
                    "provider": provider_name,
                    "uses_google_search_grounding": _gs,
                    # Backward compat: real web search only when FORCE_GROUNDING / task enables it
                    "has_grounding": _gs,
                    "attempted_providers": attempted_providers,
                }

            except Exception as e:
                last_error = e
                error_msg = str(e).lower()

                # Hard daily/free-tier 429: burn this backend for the run, try the next.
                # Abort only once every API backend (primary Gemini → lite → Groq) is burned.
                if is_daily_quota_exhausted_error(e):
                    self._daily_quota_exhausted.add(provider_name)
                    print(
                        f"  ⚠️ Daily/free-tier quota hit on {provider_name} — trying next backend…",
                        flush=True,
                    )
                    self._raise_if_all_daily_quotas_exhausted(e)
                    continue

                # Soft RPM/TPM: mark cooldown and try the next provider
                if is_quota_exhausted_error(e):
                    self._mark_provider_exhausted(provider_name)
                elif "not available" in error_msg:
                    logger.warning(f"❌ Provider {provider_name} not available: {e}")
                else:
                    logger.warning(f"💥 Failed with {provider_name}: {e}")
                continue

        # If every API backend burned daily quota while others were mid-cooldown, abort now.
        self._raise_if_all_daily_quotas_exhausted(last_error)

        if not last_error and all(
            "(cooldown)" in p or "(daily quota)" in p for p in attempted_providers
        ):
            error_msg = f"All providers skipped due to cooldown/quota. Attempted: {attempted_providers}"
        else:
            error_msg = f"All providers failed. Last error: {last_error}"
        logger.error(f"❌ {error_msg}")
        logger.error(f"📊 Attempted providers in order: {' → '.join(attempted_providers)}")

        return {
            "results": [],
            "count": 0,
            "provider": None,
            "attempted_providers": attempted_providers,
            "error": error_msg
        }

    def get_token_limits(self) -> dict:
        """Return token limits for the best available provider."""
        for provider_info in self.providers:
            try:
                if provider_info["provider"].is_available():
                    return provider_info["provider"].get_token_limits()
            except Exception:
                continue

        # Fallback defaults
        return {
            "max_tokens_per_request": 8000,
            "tokens_per_minute": 60000,
            "recommended_batch_size": 4000
        }
