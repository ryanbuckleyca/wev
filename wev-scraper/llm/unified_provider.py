"""Unified LLM provider with multi-tier fallback for complete job processing.

Tries backends in order (e.g. local Ollama when ``ENV_MODE=local``, else Gemini Flash,
Flash-Lite, Groq). Each call uses ``task=unified``: summary + values + SSE fields are
all inferred from the job text in one JSON payload.

Live **Google Search** in the Gemini SDK is off for ``task=unified`` unless
``FORCE_GROUNDING=1`` — that is independent of whether SSE columns appear in the prompt.
"""

import logging
from typing import Any, Dict, List

from llm.base import BaseLLMProvider, LLMProviderError
from llm.config import should_use_grounding
from llm.gemini import GeminiProvider
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


class UnifiedJobProcessor:
    """Unified job processor with intelligent fallback chain."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key

        # When ENV_MODE=local, local_grounded (Ollama) is preferred over API providers.
        # Tavily inside LocalGroundedProvider is only used when task=="sse", not for unified.
        local_first = [
            ("local_grounded", lambda: LocalGroundedProvider(), "Ollama (local LLM)"),
        ] if is_local_env() else []

        candidates = [
            *local_first,
            ("gemini-2.5-flash", lambda: GeminiProvider(api_key=api_key, model="gemini-2.5-flash"), "Gemini 2.5 Flash"),
            ("gemini-2.5-flash-lite", lambda: GeminiProvider(api_key=api_key, model="gemini-2.5-flash-lite"), "Gemini 2.5 Flash-Lite"),
            ("groq", lambda: GroqProvider(), "Groq"),
        ]

        self.providers = []
        for name, factory, description in candidates:
            try:
                self.providers.append({
                    "name": name,
                    "provider": factory(),
                    "description": description,
                })
            except Exception as e:
                logger.warning("Skipping LLM provider %s (not usable): %s", name, e)

        self.last_successful_provider = None

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
        from utils.job_values_prompts import _format_taxonomy

        prompt_parts = [
            get_unified_prompt_instructions(include_sse),
            "IMPORTANT: Detect the language of each job posting. Look for French words, phrases, or job titles. If the posting contains French content, you MUST write the summary in French. "
            "If the posting is in French, write your sentence in French. If in English, write in English. "
            "If the posting is written in both English and French, or explicitly requires both languages, "
            "you may write the summary in either language.",
            f"\n\nWORK VALUES TAXONOMY:\n{_format_taxonomy()}\n",
        ]

        for idx, job in enumerate(jobs, 1):
            description = (job.get("description") or "")[:4000]
            prompt_parts.append(
                f"\nJOB {idx}:\n"
                f"Organization: {job.get('organization', 'Unknown')}\n"
                f"Title: {job.get('job_title', 'Unknown')}\n"
                f"Location: {job.get('location', 'Unknown')}\n"
                f"Employment Type: {job.get('employment_type', 'Unknown')}\n"
                f"Wage: {job.get('wage', 'Not specified')}\n"
                f"Description:\n{description}"
            )

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

        from utils.job_values_prompts import WORK_VALUES_SET

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
                        if v in WORK_VALUES_SET and v not in seen:
                            seen.add(v)
                            deduped.append(v)
                    values = deduped[:max_values]
                    item["values"] = values
                    item["values_rated"] = [
                        {"value": v, "confidence": i + 1} for i, v in enumerate(values)
                    ]
                # Process language
                if isinstance(item, dict) and "language" in item:
                    lang = item["language"].lower()
                    if lang in ["en", "fr", "bilingual"]:
                        item["language"] = lang
                    else:
                        logger.warning(
                            "Unexpected language value from LLM: %r — defaulting to 'en'", lang
                        )
                        item["language"] = "en"

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
                if "rate limit" in error_msg or "429" in error_msg or "quota" in error_msg or "resource_exhausted" in error_msg:
                    logger.warning(f"🚫 Rate limit hit for {provider_name}: {e}")
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
