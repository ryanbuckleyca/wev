"""SSE / org-assessment provider chain with shared Tavily evidence.

Order (free tiers first, then extras, then local):
  1. gemini-3.6-flash
  2. gemini-3.5-flash-lite
  3. groq
  4. cerebras
  5. local_grounded (Ollama) — TEMPORARILY DISABLED (see candidates below)

Google Search tool grounding is OFF by default for SSE so all backends
classify the same Tavily snippets (predictable is_sse / sector / language /
website / extraction). Set USE_GOOGLE_SEARCH_GROUNDING=1 to restore Gemini's
native Google Search tool (divergent evidence — not recommended for parity).

Env overrides:
  GEMINI_SSE_PRIMARY_MODEL   default gemini-3.6-flash
  GEMINI_SSE_LITE_MODEL      default gemini-3.5-flash-lite
  CEREBRAS_API_KEY / CEREBRAS_MODEL
  USE_GOOGLE_SEARCH_GROUNDING  0|1
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
from llm.openai_compatible import CerebrasProvider
from llm.tavily_grounding import (
    fetch_tavily_context,
    inject_grounding_evidence,
    is_tavily_available,
    ollama_evidence_budget,
    require_tavily,
    trim_evidence,
)
from settings import get_stripped_env

logger = logging.getLogger(__name__)

DEFAULT_GEMINI_PRIMARY = "gemini-3.6-flash"
DEFAULT_GEMINI_LITE = "gemini-3.5-flash-lite"


def _use_google_search_grounding() -> bool:
    raw = (os.environ.get("USE_GOOGLE_SEARCH_GROUNDING") or "").strip().lower()
    return raw in ("1", "true", "yes", "on")


def gemini_sse_primary_model() -> str:
    return get_stripped_env("GEMINI_SSE_PRIMARY_MODEL") or DEFAULT_GEMINI_PRIMARY


def gemini_sse_lite_model() -> str:
    return get_stripped_env("GEMINI_SSE_LITE_MODEL") or DEFAULT_GEMINI_LITE


def abbreviate_llm_error(exc: BaseException, max_len: int = 160) -> str:
    """One-line truncation so giant Google JSON blobs do not dominate logs."""
    text = " ".join(str(exc).split())
    if len(text) > max_len:
        return text[: max_len - 3] + "..."
    return text


def classify_llm_failure(exc: BaseException) -> str:
    """Short human reason for a provider failure (quota/429 preferred)."""
    msg = str(exc).lower()
    is_quota = (
        "429" in msg
        or "resource_exhausted" in msg
        or "quota" in msg
        or "rate limit" in msg
        or "rate-limit" in msg
        or "rate_limit" in msg
    )
    if is_quota:
        if (
            "daily" in msg
            or "per day" in msg
            or "requests per day" in msg
            or "free_tier" in msg
            or "free tier" in msg
            or "free-tier" in msg
        ):
            return "free-tier daily quota (429)"
        if "resource_exhausted" in msg:
            return "RESOURCE_EXHAUSTED (429)"
        if "quota" in msg:
            return "quota exceeded (429)"
        return "rate limit (429)"
    if "empty response" in msg:
        return "empty response"
    return abbreviate_llm_error(exc)


def log_fallback_advance(
    failed_name: str,
    reason: str,
    next_name: str | None,
    *,
    prefix: str = "SSE fallback",
) -> None:
    """Log that a named model failed and we are immediately trying the next."""
    if next_name:
        logger.warning(
            "%s: %s hit %s → trying %s",
            prefix,
            failed_name,
            reason,
            next_name,
        )
    else:
        logger.warning(
            "%s: %s hit %s (no more providers)",
            prefix,
            failed_name,
            reason,
        )


def log_fallback_success(name: str, *, prefix: str = "SSE fallback") -> None:
    logger.info("%s: %s succeeded", prefix, name)


class SSEFallbackProvider(BaseLLMProvider):
    """Gemini 3 Flash → Flash-Lite → Groq → Cerebras (Ollama disabled)."""

    def __init__(self, api_key: str | None = None):
        self._providers: list[tuple[str, BaseLLMProvider]] = []
        self._last_successful: str | None = None

        primary = gemini_sse_primary_model()
        lite = gemini_sse_lite_model()

        candidates: list[tuple[str, Callable[[], BaseLLMProvider]]] = [
            (primary, lambda: GeminiProvider(api_key=api_key, model=primary)),
            (lite, lambda: GeminiProvider(api_key=api_key, model=lite)),
            ("groq", lambda: GroqProvider()),
            ("cerebras", lambda: CerebrasProvider()),
            # TEMPORARILY DISABLED: Ollama timeouts were burning wall-clock after
            # cloud quota exhaustion; re-enable when local model is reliable.
            # ("ollama", lambda: LocalGroundedProvider()),
        ]
        for name, factory in candidates:
            try:
                provider = factory()
                if provider.is_available():
                    self._providers.append((name, provider))
                else:
                    logger.warning("SSE fallback: skipping %s (unavailable)", name)
            except Exception as exc:
                logger.warning(
                    "SSE fallback: skipping %s (%s)",
                    name,
                    abbreviate_llm_error(exc),
                )

        if self._providers:
            logger.info(
                "SSE fallback chain: %s (tavily=%s google_search=%s)",
                " → ".join(n for n, _ in self._providers),
                is_tavily_available(),
                _use_google_search_grounding(),
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
            # Grounded SSE / org assessment assumes Tavily. Missing package or
            # key must hard-fail — never continue with empty evidence (Google
            # Search opt-in does not excuse a broken Tavily install).
            require_tavily()
            search_query = kwargs.get("search_query") or prompt[:200]
            evidence = fetch_tavily_context(
                str(search_query),
                include_domains=include_domains,
                prefer_hosts=prefer_hosts,
                require_terms=require_terms,
            )
            # Same evidence pack for every backend; Google Search / nested Tavily
            # stay off unless explicitly opted in.
            if _use_google_search_grounding():
                provider_kwargs["use_grounding"] = True
            else:
                provider_kwargs["use_grounding"] = False
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
        for idx, (name, provider) in enumerate(self._providers):
            next_name = (
                self._providers[idx + 1][0]
                if idx + 1 < len(self._providers)
                else None
            )
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
                    log_fallback_advance(name, "empty response", next_name)
                    continue
                if failed:
                    log_fallback_success(name)
                self._last_successful = name
                return result
            except Exception as exc:
                last_error = exc
                failed.append(name)
                log_fallback_advance(name, classify_llm_failure(exc), next_name)
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
        for idx, (name, provider) in enumerate(self._providers):
            next_name = (
                self._providers[idx + 1][0]
                if idx + 1 < len(self._providers)
                else None
            )
            try:
                method = getattr(provider, method_name)
                result = method(*args, **kwargs)
                if not self._is_usable_result(result):
                    last_error = LLMProviderError(f"{name} returned empty response")
                    failed.append(name)
                    log_fallback_advance(name, "empty response", next_name)
                    continue
                if failed:
                    log_fallback_success(name)
                self._last_successful = name
                return result
            except Exception as exc:
                last_error = exc
                failed.append(name)
                log_fallback_advance(name, classify_llm_failure(exc), next_name)
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
