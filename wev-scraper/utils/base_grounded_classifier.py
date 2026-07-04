from __future__ import annotations

import json
import logging
import re

from llm.base import LLMProviderError

logger = logging.getLogger(__name__)

class SSEClassificationError(Exception):
    """Base error for SSE classification failures."""
    pass

class BaseGroundedClassifier:
    """Base class providing LLM retry, error handling, and JSON parsing for grounded classifiers."""

    def _call_provider_with_retry(
        self,
        provider,
        prompt: str,
        system: str,
        task: str,
        search_query: str | None,
        retries: int = 1,
    ) -> str:
        """Call the LLM provider, mapping provider exceptions to SSEClassificationError."""
        for attempt in range(retries + 1):
            try:
                return provider.complete(
                    prompt,
                    system=system,
                    task=task,
                    search_query=search_query,
                ).strip()
            except LLMProviderError as e:
                if attempt == retries:
                    raise SSEClassificationError(f"LLM provider error: {e}") from e
            except Exception as e:
                err_msg_raw = str(e)
                err_msg = err_msg_raw.lower()
                if "429" in err_msg or "resource_exhausted" in err_msg or "quota" in err_msg:
                    if attempt == retries:
                        raise SSEClassificationError(
                            f"API rate limit or quota exceeded. Try again later. Raw error: {err_msg_raw}"
                        ) from e
                elif "403" in err_msg or "permission" in err_msg:
                    raise SSEClassificationError(
                        f"API key invalid or permission denied. Raw error: {err_msg_raw}"
                    ) from e
                else:
                    if attempt == retries:
                        raise SSEClassificationError(f"LLM API error: {err_msg_raw}") from e
                
                # If we haven't raised, we will retry (e.g. on 429)
                logger.warning("LLM call failed on attempt %d: %s. Retrying...", attempt + 1, e)

        # Unreachable but keeps type checker happy
        raise SSEClassificationError("Failed to complete LLM call")

    def _extract_json_block(self, response_text: str) -> str:
        """Strip markdown code fences from an LLM response to get raw JSON."""
        text = response_text.strip()
        match = re.search(r"^```(?:json)?\s*([\s\S]*?)\s*```\s*$", text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
        
        # Also try unanchored match if the LLM added conversational text
        match_unanchored = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
        if match_unanchored:
            return match_unanchored.group(1).strip()
            
        return text
