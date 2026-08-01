"""SSE / org-assessment provider chain with shared Tavily evidence.

Order (free tiers first, then local):
  1. gemini-3.6-flash
  2. gemini-3.5-flash-lite
  3. groq
  4. local_grounded (Ollama + Tavily already used upstream)

Shared Tavily snippets are preferred so all backends see the same evidence.
When Tavily returns nothing (missing key / empty results), Gemini backends
auto-enable the native Google Search tool so grounding is not silently lost.
When Tavily evidence was injected, Google Search stays off (no double-search).

USE_GOOGLE_SEARCH_GROUNDING overrides auto behavior:
  unset  — auto (Google Search only when shared Tavily evidence is empty)
  1      — always enable Google Search on Gemini
  0      — always disable Google Search (even when Tavily is unavailable)

Env overrides:
  GEMINI_SSE_PRIMARY_MODEL   default gemini-3.6-flash
  GEMINI_SSE_LITE_MODEL      default gemini-3.5-flash-lite
  USE_GOOGLE_SEARCH_GROUNDING  unset|0|1
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable

from llm.base import BaseLLMProvider, LLMProviderError
from llm.config import should_use_grounding
from llm.gemini import GeminiProvider
from llm.groq import GroqProvider
from llm.local_grounded import LocalGroundedProvider
from llm.tavily_grounding import (
    fetch_tavily_context,
    inject_grounding_evidence,
    is_tavily_available,
    ollama_evidence_budget,
    trim_evidence,
)
from settings import get_stripped_env

logger = logging.getLogger(__name__)

DEFAULT_GEMINI_PRIMARY = "gemini-3.6-flash"
DEFAULT_GEMINI_LITE = "gemini-3.5-flash-lite"


def _google_search_grounding_override() -> bool | None:
    """Return True/False if env forces on/off; None means auto."""
    raw = (os.environ.get("USE_GOOGLE_SEARCH_GROUNDING") or "").strip().lower()
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off"):
        return False
    return None


def _resolve_backend_grounding(*, evidence: str) -> bool:
    """Decide whether backends should run their own search grounding.

    Prefer shared Tavily evidence (no double-search). When that evidence is
    empty, auto-enable Gemini Google Search unless the env override says otherwise.
    """
    override = _google_search_grounding_override()
    if override is not None:
        return override
    return not bool((evidence or "").strip())


def gemini_sse_primary_model() -> str:
    return get_stripped_env("GEMINI_SSE_PRIMARY_MODEL") or DEFAULT_GEMINI_PRIMARY


def gemini_sse_lite_model() -> str:
    return get_stripped_env("GEMINI_SSE_LITE_MODEL") or DEFAULT_GEMINI_LITE


class SSEFallbackProvider(BaseLLMProvider):
    """Gemini 3 Flash → Flash-Lite → Groq → Ollama, with shared Tavily evidence."""

    def __init__(self, api_key: str | None = None):
        self._providers: list[tuple[str, BaseLLMProvider]] = []
        self._last_successful: str | None = None

        primary = gemini_sse_primary_model()
        lite = gemini_sse_lite_model()

        candidates: list[tuple[str, Callable[[], BaseLLMProvider]]] = [
            (primary, lambda: GeminiProvider(api_key=api_key, model=primary)),
            (lite, lambda: GeminiProvider(api_key=api_key, model=lite)),
            ("groq", lambda: GroqProvider()),
            ("ollama", lambda: LocalGroundedProvider()),
        ]
        for name, factory in candidates:
            try:
                provider = factory()
                if provider.is_available():
                    self._providers.append((name, provider))
                else:
                    logger.warning("SSE fallback: skipping %s (unavailable)", name)
            except Exception as exc:
                logger.warning("SSE fallback: skipping %s (%s)", name, exc)

        if self._providers:
            logger.info(
                "SSE fallback chain: %s (tavily=%s google_search_override=%s)",
                " → ".join(n for n, _ in self._providers),
                is_tavily_available(),
                _google_search_grounding_override(),
            )

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
        task = kwargs.get("task")
        want_grounding = should_use_grounding(task) if task else False
        if "use_grounding" in kwargs:
            want_grounding = bool(kwargs["use_grounding"])

        provider_kwargs = dict(kwargs)
        include_domains = provider_kwargs.pop("include_domains", None)
        prefer_hosts = provider_kwargs.pop("prefer_hosts", None)
        require_terms = provider_kwargs.pop("require_terms", None)

        evidence = ""
        if want_grounding:
            search_query = kwargs.get("search_query") or prompt[:200]
            evidence = fetch_tavily_context(
                str(search_query),
                include_domains=include_domains,
                prefer_hosts=prefer_hosts,
                require_terms=require_terms,
            )
            # Shared Tavily when present; otherwise auto Google Search on Gemini
            # (USE_GOOGLE_SEARCH_GROUNDING overrides — see module docstring).
            provider_kwargs["use_grounding"] = _resolve_backend_grounding(
                evidence=evidence,
            )
        else:
            provider_kwargs.pop("use_grounding", None)

        if not want_grounding:
            return self._try_providers(
                "complete",
                prompt,
                model=model,
                system=system,
                **provider_kwargs,
            )

        # Per-backend prompt: identical rules, tighter evidence budget for Ollama.
        return self._try_grounded_complete(
            prompt,
            evidence=evidence,
            model=model,
            system=system,
            **provider_kwargs,
        )

    def _try_grounded_complete(
        self,
        prompt: str,
        *,
        evidence: str,
        model: str | None = None,
        system: str | None = None,
        **kwargs,
    ) -> str:
        if not self._providers:
            raise LLMProviderError("No SSE providers are available or configured")

        last_error: Exception | None = None
        failed: list[str] = []
        for name, provider in self._providers:
            ev = evidence
            if name == "ollama":
                ev = trim_evidence(evidence, max_chars=ollama_evidence_budget())
            call_prompt = inject_grounding_evidence(prompt, ev)
            try:
                result = provider.complete(
                    call_prompt, model=model, system=system, **kwargs,
                )
                if not self._is_usable_result(result):
                    last_error = LLMProviderError(f"{name} returned empty response")
                    failed.append(name)
                    logger.warning("SSE provider %s returned empty response", name)
                    continue
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

    @staticmethod
    def _is_usable_result(result) -> bool:
        if result is None:
            return False
        if isinstance(result, str) and not result.strip():
            return False
        return True

    def _try_providers(self, method_name: str, *args, **kwargs):
        if not self._providers:
            raise LLMProviderError("No SSE providers are available or configured")

        last_error: Exception | None = None
        failed: list[str] = []
        for name, provider in self._providers:
            try:
                method = getattr(provider, method_name)
                result = method(*args, **kwargs)
                if not self._is_usable_result(result):
                    last_error = LLMProviderError(f"{name} returned empty response")
                    failed.append(name)
                    logger.warning("SSE provider %s returned empty response", name)
                    continue
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
