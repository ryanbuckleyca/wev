"""Unified LLM provider with multi-tier fallback for complete job processing.

Tries backends in order:
  gemini-3.6-flash → gemini-3.5-flash-lite → groq → ollama (when available).
When ``ENV_MODE=local``, Ollama is also tried earlier for offline preference on
unified (non-SSE-grounded) batches.

Each call uses ``task=unified``: summary + values + SSE fields are all inferred
from the job text in one JSON payload.

Live **Google Search** in the Gemini SDK is off for ``task=unified`` unless
``FORCE_GROUNDING=1`` — that is independent of whether SSE columns appear in the prompt.
"""

import logging
import time
from typing import Any, Dict, List

from llm.base import BaseLLMProvider, LLMProviderError
from llm.config import should_use_grounding
from llm.gemini import GeminiProvider
from llm.gemini_fallback import gemini_sse_lite_model, gemini_sse_primary_model
from llm.groq import GroqProvider
from llm.local_grounded import LocalGroundedProvider
from llm.prompts import (
    get_unified_prompt_instructions,
    get_unified_system_prompt,
)
from settings import get_stripped_env, is_local_env

logger = logging.getLogger(__name__)

# Single prompt shape for every backend: always request SSE *fields* (model infers from text).
UNIFIED_INCLUDE_SSE_FIELDS = True

DEFAULT_COOLDOWN_MINUTES = 15


def _get_cooldown_minutes() -> int:
    """Get quota cooldown period from env, default 15 minutes."""
    try:
        return int(get_stripped_env("QUOTA_COOLDOWN_MINUTES") or DEFAULT_COOLDOWN_MINUTES)
    except (ValueError, TypeError):
        return DEFAULT_COOLDOWN_MINUTES


def _is_quota_exhausted_error(exc: Exception) -> bool:
    """Check if exception indicates quota/rate limit exhaustion."""
    err_str = str(exc).lower()
    return (
        "429" in err_str
        or "resource_exhausted" in err_str
        or "quota" in err_str
        or "rate limit" in err_str
    )


class UnifiedJobProcessor:
    """Unified job processor with intelligent fallback chain."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key
        # Track providers with quota exhaustion and when they can be retried
        self._exhausted_until: dict[str, float] = {}
        self._cooldown_seconds = _get_cooldown_minutes() * 60

        primary = gemini_sse_primary_model()
        lite = gemini_sse_lite_model()

        # When ENV_MODE=local, prefer Ollama early for unified batches (no API spend).
        local_first = [
            ("ollama", lambda: LocalGroundedProvider(), "Ollama (local LLM)"),
        ] if is_local_env() else []

        candidates = [
            *local_first,
            (primary, lambda: GeminiProvider(api_key=api_key, model=primary), f"Gemini ({primary})"),
            (lite, lambda: GeminiProvider(api_key=api_key, model=lite), f"Gemini ({lite})"),
            ("groq", lambda: GroqProvider(), "Groq"),
        ]
        # Always append Ollama last when not already first (API-exhausted fallback).
        if not is_local_env():
            candidates.append(
                ("ollama", lambda: LocalGroundedProvider(), "Ollama (local LLM)"),
            )

        self.providers = []
        for name, factory, description in candidates:
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

    def _is_provider_in_cooldown(self, name: str) -> bool:
        """Check if provider is in cooldown period after quota exhaustion."""
        if name not in self._exhausted_until:
            return False

        now = time.time()
        cooldown_expires = self._exhausted_until[name]

        if now >= cooldown_expires:
            # Cooldown expired, remove from tracking
            del self._exhausted_until[name]
            logger.info("Unified provider %s cooldown expired, re-enabling", name)
            return False

        # Still in cooldown - no logging needed
        return True

    def _mark_provider_exhausted(self, name: str) -> None:
        """Mark provider as quota exhausted with time-bounded cooldown."""
        cooldown_expires = time.time() + self._cooldown_seconds
        self._exhausted_until[name] = cooldown_expires
        logger.warning(
            "🚫 Rate limit hit for %s — cooling down for %d minutes",
            name,
            _get_cooldown_minutes(),
        )

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

        job_chunks = format_job_chunks(jobs, max_desc_chars=4000)
        for chunk in job_chunks:
            prompt_parts.append(f"\n{chunk}")

        fields = "index, summary, language, values, is_sse, sse_confidence" if include_sse else "index, summary, language, values"
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

            # Skip providers in cooldown period after quota exhaustion
            if self._is_provider_in_cooldown(provider_name):
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

                all_results = provider.complete_batch(
                    items=jobs,
                    build_prompt=build_prompt,
                    parse_response=parse_response,
                    system=system,
                    task="unified",
                    raise_for_fallback=True,
                )

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

                # Mark provider as exhausted if quota/rate limit hit
                if _is_quota_exhausted_error(e):
                    self._mark_provider_exhausted(provider_name)
                elif "not available" in error_msg:
                    logger.warning(f"❌ Provider {provider_name} not available: {e}")
                else:
                    logger.warning(f"💥 Failed with {provider_name}: {e}")
                continue

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
