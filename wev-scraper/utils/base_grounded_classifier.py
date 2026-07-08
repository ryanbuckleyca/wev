from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from llm.base import LLMProviderError

if TYPE_CHECKING:
    from utils.sse_classifier import SSEClassificationResult

logger = logging.getLogger(__name__)


class SSEClassificationError(Exception):
    """Base error for SSE classification failures."""
    pass


def _is_rate_limit(err: str) -> bool:
    lower = err.lower()
    return "429" in err or "resource_exhausted" in lower or "quota" in lower


class BaseGroundedClassifier:
    """Base class providing LLM error handling and JSON parsing for grounded classifiers."""

    def _call_provider_with_retry(
        self,
        provider,
        prompt: str,
        system: str,
        task: str,
        search_query: str | None,
        retries: int = 1,
    ) -> str:
        """Call the LLM provider, mapping provider exceptions to SSEClassificationError.

        Retries up to `retries` additional times on rate-limit errors (429).
        Auth errors (403) are re-raised immediately without retry.
        """
        for attempt in range(retries + 1):
            try:
                return provider.complete(
                    prompt,
                    system=system,
                    task=task,
                    search_query=search_query,
                ).strip()
            except LLMProviderError as e:
                if _is_rate_limit(str(e)) and attempt < retries:
                    logger.warning("LLM rate limit on attempt %d/%d, retrying...", attempt + 1, retries + 1)
                    time.sleep(2 ** attempt)
                    continue
                raise SSEClassificationError(f"LLM provider error: {e}") from e
            except Exception as e:
                err = str(e)
                if "403" in err or "permission" in err.lower():
                    raise SSEClassificationError(
                        f"API key invalid or permission denied. Raw error: {err}"
                    ) from e
                if _is_rate_limit(err) and attempt < retries:
                    logger.warning("LLM rate limit on attempt %d/%d, retrying...", attempt + 1, retries + 1)
                    time.sleep(2 ** attempt)
                    continue
                raise SSEClassificationError(f"LLM API error: {err}") from e

    @staticmethod
    def _extract_json_block(response_text: str) -> str:
        """Strip markdown code fences from an LLM response to get raw JSON."""
        text = response_text.strip()
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
        return text

    @staticmethod
    def _default_failed_classification(reason: str | None = None) -> SSEClassificationResult:
        """Return a safe fallback SSEClassificationResult when parsing fails."""
        return {
            "rating": "no",
            "confidence": 0.5,
            "reasoning": reason or "Unable to classify: failed to parse classifier output.",
            "must_haves_met": [],
            "nice_to_haves_met": [],
            "flags": ["classification_failed"],
            "classified_at": datetime.now(timezone.utc).isoformat(),
            "reviewed": False,
        }
