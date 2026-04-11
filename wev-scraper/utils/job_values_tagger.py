"""Job work-value tagger."""

from __future__ import annotations

import json
import re
from typing import TypedDict

from llm.base import LLMProviderError
from llm.factory import DEFAULT_MODEL, get_provider
from utils.job_values_prompts import WORK_VALUES_SET, VALUES_SYSTEM_MSG, get_values_batch_prompt

# Rough ceiling: leave a comfortable margin below the model's context window.
# Estimated at 4 chars per token; 80k tokens = 320k chars — fits ~80-100 typical jobs.
_MAX_PROMPT_CHARS = 320_000


class JobValuesTaggerError(Exception):
    """Raised when work-value tagging fails."""


class JobRatedValue(TypedDict):
    """A job value with a confidence score."""

    value: str
    confidence: int


class JobValuesResult(TypedDict):
    """Normalized result per job."""

    values: list[str]
    values_rated: list[JobRatedValue]
    reasoning: str


def _extract_json(text: str):
    """Extract a JSON array from model output, tolerating preamble text and code fences."""
    cleaned = text.strip()
    # Strip markdown code fences
    fence_match = re.search(r"^```(?:json)?\s*([\s\S]*?)\s*```", cleaned, re.IGNORECASE)
    if fence_match:
        cleaned = fence_match.group(1).strip()
    # Try a direct parse first (model was well-behaved)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # Fall back: find first JSON array that starts with an object, handles preamble like
    # "Here are the values [see taxonomy]:" which would fool a naive \[\s\S]+\] regex.
    m = re.search(r"\[\s*\{[\s\S]*\}\s*\]", cleaned)
    if m:
        return json.loads(m.group())
    raise json.JSONDecodeError("No valid JSON array found in response", text, 0)


class JobValuesTagger:
    """Tags jobs with allowed work values (no grounding needed)."""

    def __init__(self, model: str | None = None):
        """Initialize with Groq provider for values tagging."""
        # Values tagging provider selected by name, not model kwarg.
        try:
            self.provider = get_provider(name=DEFAULT_MODEL, **(({"model": model} if model else {})))
        except Exception as e:
            raise JobValuesTaggerError(f"LLM provider not available: {e}") from e

    def tag_jobs_batch(self, jobs: list[dict], max_values: int = 5) -> list[JobValuesResult]:
        """Tag jobs with values using token-aware batching via complete_batch()."""
        if not jobs:
            return []

        def build_prompt(batch: list[dict]) -> str:
            return get_values_batch_prompt(batch, max_values=max_values)

        def parse_response(text: str, batch: list[dict]) -> list[JobValuesResult]:
            if not text or not text.strip():
                return [{"values": [], "values_rated": [], "reasoning": "Empty response"} for _ in batch]
            try:
                parsed = _extract_json(text)
                return self._normalize_batch_response(parsed, len(batch), max_values=max_values)
            except (json.JSONDecodeError, JobValuesTaggerError):
                return [{"values": [], "values_rated": [], "reasoning": "Parse error"} for _ in batch]

        results = self.provider.complete_batch(
            items=jobs,
            build_prompt=build_prompt,
            parse_response=parse_response,
            system=VALUES_SYSTEM_MSG,
        )

        # Replace any None slots (failed batches) with empty results
        return [r if r is not None else {"values": [], "values_rated": [], "reasoning": "Failed"} for r in results]

    def _normalize_batch_response(
        self,
        parsed,
        expected_count: int,
        max_values: int = 5,
    ) -> list[JobValuesResult]:
        if not isinstance(parsed, list):
            raise JobValuesTaggerError(f"Expected JSON array, got {type(parsed)}")

        normalized: list[JobValuesResult] = [
            {"values": [], "values_rated": [], "reasoning": "No result returned"} for _ in range(expected_count)
        ]

        # Fill by explicit index first.
        used_positions: set[int] = set()
        for item in parsed:
            if not isinstance(item, dict):
                continue
            raw_index = item.get("index")
            if not isinstance(raw_index, int):
                continue
            pos = raw_index - 1
            if pos < 0 or pos >= expected_count:
                continue
            normalized[pos] = self._normalize_item(item, max_values=max_values)
            used_positions.add(pos)

        # Fill any remaining positions by order, to tolerate missing index fields.
        fallback_items = [item for item in parsed if isinstance(item, dict)]
        fallback_cursor = 0
        for pos in range(expected_count):
            if pos in used_positions:
                continue
            while fallback_cursor < len(fallback_items):
                candidate = fallback_items[fallback_cursor]
                fallback_cursor += 1
                normalized[pos] = self._normalize_item(candidate, max_values=max_values)
                break

        return normalized

    def _normalize_item(self, item: dict, max_values: int = 5) -> JobValuesResult:
        raw_values = item.get("values")
        if not isinstance(raw_values, list):
            raw_values = []

        deduped: list[str] = []
        seen: set[str] = set()
        for raw in raw_values:
            value = str(raw).strip()
            if value in WORK_VALUES_SET and value not in seen:
                seen.add(value)
                deduped.append(value)

        values = deduped[:max_values]
        values_rated: list[JobRatedValue] = [
            {"value": v, "confidence": i + 1} for i, v in enumerate(values)
        ]

        return {
            "values": values,
            "values_rated": values_rated,
            "reasoning": str(item.get("reasoning", "")).strip(),
        }

