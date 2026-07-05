from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from llm.base import LLMProviderError

logger = logging.getLogger(__name__)


class SSEClassificationError(Exception):
    """Base error for SSE classification failures."""
    pass


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
                raise SSEClassificationError(f"LLM provider error: {e}") from e
            except Exception as e:
                err_msg_raw = str(e)
                err_msg = err_msg_raw.lower()

                if "403" in err_msg or "permission" in err_msg:
                    raise SSEClassificationError(
                        f"API key invalid or permission denied. Raw error: {err_msg_raw}"
                    ) from e

                is_rate_limit = "429" in err_msg or "resource_exhausted" in err_msg or "quota" in err_msg
                if attempt < retries and is_rate_limit:
                    logger.warning("LLM rate limit on attempt %d/%d, retrying...", attempt + 1, retries + 1)
                    continue

                raise SSEClassificationError(f"LLM API error: {err_msg_raw}") from e

        # Unreachable, but satisfies the type checker
        raise SSEClassificationError("Failed to complete LLM call")

    def _extract_json_block(self, response_text: str) -> str:
        """Strip markdown code fences from an LLM response to get raw JSON."""
        text = response_text.strip()
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
        return text

    @staticmethod
    def _default_failed_classification(*args) -> dict:
        """Return a safe fallback SSEClassificationResult when parsing fails."""
        reason = args[-1] if args else None
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
