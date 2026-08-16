"""SSE / org-assessment provider chain with shared Tavily evidence.

Order (free tiers first, then local):
  1. gemini-3.6-flash
  2. gemini-3.5-flash-lite
  3. groq
  4. ollama (LocalGroundedProvider)

Shared Tavily snippets are preferred so all backends see the same evidence.
Gemini native Google Search is **never** enabled by this provider — grounding
is Tavily-only. When Tavily returns nothing, backends still receive
``use_grounding=False`` (no silent Google Search fallback).

``USE_GOOGLE_SEARCH_GROUNDING=1`` remains an explicit opt-in escape hatch for
Gemini Google Search (parity / debugging only).

Env overrides:
  GEMINI_SSE_PRIMARY_MODEL   default gemini-3.6-flash
  GEMINI_SSE_LITE_MODEL      default gemini-3.5-flash-lite
  USE_GOOGLE_SEARCH_GROUNDING  unset|0 → off; 1 → force Google Search on Gemini
  MAX_GROUNDED_PROMPT_CHARS  default 100000; head+tail cap for Gemini/Groq
  QUOTA_COOLDOWN_MINUTES     default 15; cooldown period after quota exhaustion
"""

from __future__ import annotations

import logging
import os
import time
from collections.abc import Callable

from llm.base import BaseLLMProvider, LLMProviderError
from llm.config import should_use_grounding
from llm.cooldown import ProviderCooldownMixin, get_cooldown_minutes, is_quota_exhausted_error
from llm.gemini import GeminiProvider
from llm.groq import GroqProvider
from llm.local_grounded import LocalGroundedProvider
from llm.tavily_grounding import (
    fetch_tavily_context,
    inject_grounding_evidence,
    is_tavily_available,
    max_grounded_prompt_chars,
    ollama_evidence_budget,
    trim_evidence,
    truncate_keep_ends,
)
from settings import get_stripped_env

logger = logging.getLogger(__name__)

DEFAULT_GEMINI_PRIMARY = "gemini-3.6-flash"
DEFAULT_GEMINI_LITE = "gemini-3.5-flash-lite"
DEFAULT_COOLDOWN_MINUTES = 15

# Backends that must never run nested search / Google Search when shared
# Tavily evidence is (or isn't) injected upstream.
_NON_GEMINI_BACKENDS = frozenset({"groq", "ollama", "cerebras"})





def _google_search_grounding_override() -> bool | None:
    """Return True if env forces Google Search on; False/None means off (Tavily-only)."""
    raw = (os.environ.get("USE_GOOGLE_SEARCH_GROUNDING") or "").strip().lower()
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off"):
        return False
    return None


def _is_gemini_backend(name: str) -> bool:
    return "gemini" in (name or "").lower()


def _resolve_backend_grounding(*, evidence: str) -> bool:
    """Decide whether *Gemini* should run native Google Search grounding.

    Default is never — SSE uses shared Tavily only. ``USE_GOOGLE_SEARCH_GROUNDING=1``
    is the sole opt-in. Non-Gemini backends are handled separately and always get
    ``use_grounding=False`` (no nested Tavily / Google Search).
    """
    del evidence  # retained for call-site compatibility; no longer auto-gates
    override = _google_search_grounding_override()
    if override is True:
        return True
    # unset / 0 / False → never Google Search (Tavily-only)
    return False


def _backend_complete_kwargs(name: str, *, evidence: str, kwargs: dict) -> dict:
    """Per-backend complete kwargs under Tavily-only policy.

    Non-Gemini (groq / ollama / cerebras): always ``use_grounding=False`` and
    strip ``search_query`` so LocalGrounded cannot nested-search.
    Gemini: Google Search only when ``USE_GOOGLE_SEARCH_GROUNDING=1``.
    """
    call_kwargs = dict(kwargs)
    if name in _NON_GEMINI_BACKENDS or not _is_gemini_backend(name):
        call_kwargs["use_grounding"] = False
        call_kwargs.pop("search_query", None)
        return call_kwargs
    call_kwargs["use_grounding"] = _resolve_backend_grounding(evidence=evidence)
    # Shared Tavily (if any) is already in the prompt; do not pass search_query.
    call_kwargs.pop("search_query", None)
    return call_kwargs


def _model_for_backend(name: str, model: str | None) -> str | None:
    """Pass Gemini model overrides only to Gemini backends.

    Groq/Ollama must keep their own defaults — a Gemini id (e.g. gemini-3.6-flash)
    is invalid on those APIs and must not be forwarded.
    """
    if model is None:
        return None
    if _is_gemini_backend(name):
        return model
    return None


def gemini_sse_primary_model() -> str:
    return get_stripped_env("GEMINI_SSE_PRIMARY_MODEL") or DEFAULT_GEMINI_PRIMARY


def gemini_sse_lite_model() -> str:
    return get_stripped_env("GEMINI_SSE_LITE_MODEL") or DEFAULT_GEMINI_LITE


class SSEFallbackProvider(ProviderCooldownMixin, BaseLLMProvider):
    """Gemini 3 Flash → Flash-Lite → Groq → Ollama, with shared Tavily evidence."""

    def __init__(self, api_key: str | None = None):
        self._providers: list[tuple[str, BaseLLMProvider]] = []
        self._last_successful: str | None = None
        # Track providers with quota exhaustion and when they can be retried
        # Maps provider name → timestamp when cooldown expires
        self._exhausted_until: dict[str, float] = {}
        self._cooldown_seconds = _get_cooldown_minutes() * 60

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
                # required=True: any path that enables grounding must have working Tavily.
                # This covers task=sse, FORCE_GROUNDING=1, and explicit use_grounding=True.
                # Callers that want soft degradation should not enable grounding.
                required=True,
            )
            # Default for the chain: Tavily-only. Per-backend overrides in
            # _try_grounded_complete force non-Gemini off and strip search_query.
            provider_kwargs["use_grounding"] = _resolve_backend_grounding(
                evidence=evidence,
            )
        else:
            # Forward explicit False so backends do not re-enable via
            # should_use_grounding(task).
            provider_kwargs["use_grounding"] = False

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
            # Skip providers in cooldown period after quota exhaustion
            if self._is_provider_in_cooldown(name):
                failed.append(name)
                continue

            ev = evidence
            if name == "ollama":
                # Tight evidence budget; LocalGroundedProvider also caps via
                # OLLAMA_MAX_PROMPT_CHARS.
                ev = trim_evidence(evidence, max_chars=ollama_evidence_budget())
            call_prompt = inject_grounding_evidence(prompt, ev)
            if name != "ollama":
                # Cloud path: cap combined prompt+evidence (head+tail) so
                # oversized job text cannot blow past provider limits.
                limit = max_grounded_prompt_chars()
                if limit > 0 and len(call_prompt) > limit:
                    logger.warning(
                        "SSE grounded: truncating %s prompt %s → %s chars (head+tail)",
                        name,
                        len(call_prompt),
                        limit,
                    )
                    call_prompt = truncate_keep_ends(call_prompt, limit)
            call_kwargs = _backend_complete_kwargs(
                name, evidence=evidence, kwargs=kwargs,
            )
            try:
                result = provider.complete(
                    call_prompt,
                    model=_model_for_backend(name, model),
                    system=system,
                    **call_kwargs,
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

                # Mark provider as exhausted with time-bounded cooldown if quota error
                if is_quota_exhausted_error(exc):
                    self._mark_provider_exhausted(name)
                else:
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
        # Gemini-specific model override must not leak to Groq/Ollama.
        model_override = kwargs.pop("model", None)
        for name, provider in self._providers:
            # Skip providers in cooldown period after quota exhaustion
            if self._is_provider_in_cooldown(name):
                failed.append(name)
                continue

            try:
                method = getattr(provider, method_name)
                call_kwargs = dict(kwargs)
                backend_model = _model_for_backend(name, model_override)
                if backend_model is not None:
                    call_kwargs["model"] = backend_model
                elif model_override is not None and method_name == "complete":
                    # Explicitly omit Gemini id; provider keeps its own default.
                    call_kwargs.pop("model", None)
                result = method(*args, **call_kwargs)
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

                # Mark provider as exhausted with time-bounded cooldown if quota error
                if is_quota_exhausted_error(exc):
                    self._mark_provider_exhausted(name)
                else:
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
