"""SSE provider with automatic Flash → Flash-Lite → Groq fallback.

Primary: gemini-2.5-flash (Google Search grounding)
Fallback: gemini-2.5-flash-lite (Google Search grounding, higher free-tier limits)
Final: groq (no grounding, same JSON shape)

Used by OrganizationAssessor / SSEClassifier via get_sse_provider().
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from llm.base import BaseLLMProvider, LLMProviderError
from llm.gemini import GeminiProvider
from llm.groq import GroqProvider

logger = logging.getLogger(__name__)


class SSEFallbackProvider(BaseLLMProvider):
    """Try Gemini Flash, then Flash-Lite, then Groq on any call failure."""

    def __init__(self, api_key: str | None = None):
        self._providers: list[tuple[str, BaseLLMProvider]] = []
        self._last_successful: str | None = None

        candidates: list[tuple[str, Callable[[], BaseLLMProvider]]] = [
            ("gemini-2.5-flash", lambda: GeminiProvider(api_key=api_key, model="gemini-2.5-flash")),
            ("gemini-2.5-flash-lite", lambda: GeminiProvider(api_key=api_key, model="gemini-2.5-flash-lite")),
            ("groq", lambda: GroqProvider()),
        ]
        for name, factory in candidates:
            try:
                provider = factory()
                if provider.is_available():
                    self._providers.append((name, provider))
            except Exception as exc:
                logger.warning("SSE fallback: skipping %s (%s)", name, exc)

    def is_available(self) -> bool:
        return bool(self._providers)

    def _primary(self) -> BaseLLMProvider:
        if not self._providers:
            raise LLMProviderError("No SSE providers are available or configured")
        return self._providers[0][1]

    def get_token_limits(self) -> dict:
        return self._primary().get_token_limits()

    def summarize_text(
        self,
        text: str,
        max_chars: int = 300,
        org_name: str | None = None,
        job_title: str | None = None,
    ) -> str:
        return self._try_providers(
            "summarize_text",
            text,
            max_chars,
            org_name=org_name,
            job_title=job_title,
        )

    def complete(
        self,
        prompt: str,
        model: str | None = None,
        system: str | None = None,
        **kwargs,
    ) -> str:
        return self._try_providers("complete", prompt, model=model, system=system, **kwargs)

    def _try_providers(self, method_name: str, *args, **kwargs):
        if not self._providers:
            raise LLMProviderError("No SSE providers are available or configured")

        last_error: Exception | None = None
        failed: list[str] = []
        for name, provider in self._providers:
            try:
                method = getattr(provider, method_name)
                result = method(*args, **kwargs)
                if failed:
                    logger.info(
                        "SSE fallback succeeded: %s → %s",
                        " → ".join(failed),
                        name,
                    )
                self._last_successful = name
                return result
            except Exception as exc:
                last_error = exc
                failed.append(name)
                logger.warning("SSE provider %s failed: %s", name, exc)
                continue

        if last_error:
            raise last_error
        raise LLMProviderError("All SSE providers failed")

    @property
    def current_model(self) -> str:
        if self._last_successful:
            return self._last_successful
        return self._providers[0][0] if self._providers else "none"


# Backward-compatible alias
GeminiFallbackProvider = SSEFallbackProvider
