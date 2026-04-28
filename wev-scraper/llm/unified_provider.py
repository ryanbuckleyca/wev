"""Unified LLM provider with multi-tier fallback for complete job processing.

Primary: gemini-2.5-flash (free tier: 10 RPM, 250K TPM, 20 RPD, 500 grounding/day)
Fallback: gemini-2.5-flash-lite (free tier: 5 RPM, 250K TPM, 20 RPD, 500 grounding/day)
Final: groq (free tier: ~10 RPM, 12K TPM, 1,000 requests/hour, no grounding)

Extracts: summary, values, is_sse in one call.
"""

import logging
from typing import Any, Dict, List

from llm.base import BaseLLMProvider, LLMProviderError
from llm.gemini import GeminiProvider
from llm.groq import GroqProvider
from llm.local_grounded import LocalGroundedProvider
from llm.prompts import (
    get_unified_prompt_instructions,
    get_unified_system_prompt,
)
from settings import is_local_env

logger = logging.getLogger(__name__)


class UnifiedJobProcessor:
    """Unified job processor with intelligent fallback chain."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key

        # Initialize providers in fallback order, skipping any that aren't configured.
        # When ENV_MODE=local, local_grounded (Ollama) is preferred over the API
        # providers so that backlogs can be processed without consuming Gemini/Groq
        # quota. has_grounding=True for local_grounded means "include SSE field in
        # the unified prompt"; the actual Tavily search is gated by task=="sse"
        # inside LocalGroundedProvider, so unified calls never hit Tavily.
        local_first = [
            ("local_grounded", lambda: LocalGroundedProvider(), True, "Ollama (local LLM)"),
        ] if is_local_env() else []

        candidates = [
            *local_first,
            ("gemini-2.5-flash",      lambda: GeminiProvider(api_key=api_key, model="gemini-2.5-flash"),      True,  "Gemini 2.5 Flash with grounding"),
            ("gemini-2.5-flash-lite", lambda: GeminiProvider(api_key=api_key, model="gemini-2.5-flash-lite"), True,  "Gemini 2.5 Flash-Lite with grounding"),
            ("groq",                  lambda: GroqProvider(),                                                  False, "Groq (no grounding)"),
        ]

        self.providers = []
        for name, factory, has_grounding, description in candidates:
            try:
                self.providers.append({
                    "name": name,
                    "provider": factory(),
                    "has_grounding": has_grounding,
                    "description": description,
                })
            except Exception as e:
                logger.debug(f"Skipping provider {name} (not configured): {e}")

        self.last_successful_provider = None

    def _try_provider(self, provider_info: dict, jobs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Try a specific provider for job processing."""
        provider = provider_info["provider"]
        if not provider.is_available():
            raise LLMProviderError(f"Provider {provider_info['name']} not available")
        try:
            return self._process_with_provider(jobs, provider, include_sse=provider_info["has_grounding"])
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
            "If the posting is in French, write your sentence in French. If in English, write in English.",
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

        fields = "index, summary, values, is_sse, sse_confidence" if include_sse else "index, summary, values"
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

                include_sse = provider_info["has_grounding"]
                system = get_unified_system_prompt(include_sse=include_sse)

                def build_prompt(batch: List[Dict], _sse: bool = include_sse) -> str:
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
                )

                self.last_successful_provider = provider_name
                grounding_status = "with grounding" if include_sse else "without grounding"
                logger.info(f"✅ Success with {provider_name} {grounding_status}: processed {len(all_results)} jobs")

                if attempted_providers[0] != provider_name:
                    logger.info(f"🔄 Fallback successful: {attempted_providers[0]} → {provider_name}")

                return {
                    "results": all_results,
                    "count": len(all_results),
                    "provider": provider_name,
                    "has_grounding": include_sse,
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
