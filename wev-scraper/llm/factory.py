"""Factory for LLM provider selection.

Default: Groq for most tasks (summarization, location extraction, values tagging).
SSE / org assessment chain (``get_sse_provider`` / ``get_fallback_llm_provider``):
  gemini-3.6-flash → gemini-3.5-flash-lite → groq → ollama
with shared Tavily evidence (see ``llm.gemini_fallback`` / ``llm.tavily_grounding``).
"""

import logging
from typing import TYPE_CHECKING, Literal

from llm.base import BaseLLMProvider
from llm.gemini import GeminiProvider
from llm.groq import GroqProvider
from llm.local_grounded import LocalGroundedProvider
from settings import get_stripped_env, is_local_env

if TYPE_CHECKING:
    from llm.unified_provider import UnifiedJobProcessor

logger = logging.getLogger(__name__)

ProviderName = Literal["gemini", "groq"]

# Model defaults
# DEFAULT_MODEL: Used for most tasks (summarization, location extraction, values tagging)
# SSE / org assessment: Gemini 3 Flash → Flash-Lite → Groq → Ollama via SSEFallbackProvider
DEFAULT_MODEL = "groq"  # Free tier: ~10 RPM, 12K TPM, 1000 RPH

PROVIDERS: dict[str, type[BaseLLMProvider]] = {
    "gemini": GeminiProvider,
    "groq": GroqProvider,
    "local_grounded": LocalGroundedProvider,
}


def _is_local_mode() -> bool:
    """Return True if running locally (ENV_MODE=local)."""
    return is_local_env()


def get_job_summary_provider() -> BaseLLMProvider | None:
    """Return the LLM provider for job summarization, or None if not configured.

    Priority order:
    1. If ENV_MODE=local: local_grounded (Ollama)
    2. Otherwise: LLM_PROVIDER env var or default "groq"
    """
    if _is_local_mode():
        try:
            provider = get_provider(name="local_grounded")
            if provider.is_available():
                return provider
        except Exception:
            pass

    try:
        provider = get_provider()
        if provider.is_available():
            return provider
    except Exception:
        pass
    return None


def get_provider(
    name: str | None = None,
    **kwargs,
) -> BaseLLMProvider:
    """Return an LLM provider instance.

    Args:
        name: Provider key (e.g. "gemini"). If None, uses env LLM_PROVIDER or auto-detects.
        **kwargs: Passed to the provider constructor (e.g. api_key, model).

    Returns:
        Provider instance.

    Raises:
        ValueError: If provider name not found or provider unavailable.
    """
    if name is None:
        name = get_stripped_env("LLM_PROVIDER") or None

        if name is None and _is_local_mode():
            name = "local_grounded"
            logger.info("Local mode: using local_grounded provider")

        if name is None:
            name = DEFAULT_MODEL

    if name not in PROVIDERS:
        raise ValueError(f"Unknown provider: {name}")
    provider_class = PROVIDERS[name]
    try:
        provider = provider_class(**kwargs)
        if not provider.is_available():
            raise ValueError(f"Provider {name} not available")
        return provider
    except Exception as e:
        raise ValueError(f"Provider {name} failed to initialize: {e}") from e


def get_fallback_llm_provider() -> BaseLLMProvider | None:
    """Return multi-tier LLM provider with runtime fallback.

    Always uses ``SSEFallbackProvider`` when available:
      gemini-3.6-flash → gemini-3.5-flash-lite → groq → ollama

    Shared Tavily evidence is injected once for ``task=sse`` so every backend
    sees the same snippets. Providers that fail to initialize are skipped.

    Used by OrganizationAssessor, SSEClassifier, and location extraction.
    """
    try:
        from llm.gemini_fallback import SSEFallbackProvider

        provider = SSEFallbackProvider()
        if provider.is_available():
            return provider
    except Exception as exc:
        logger.warning("LLM fallback provider unavailable: %s", exc)

    # Last resort: Ollama alone (e.g. no Gemini/Groq keys and chain init failed)
    if _is_local_mode():
        try:
            provider = get_provider(name="local_grounded")
            if provider.is_available():
                return provider
        except Exception:
            pass

    return None


def get_sse_provider() -> BaseLLMProvider | None:
    """Return provider for SSE / org assessment (alias of get_fallback_llm_provider)."""
    return get_fallback_llm_provider()


def get_unified_processor(**kwargs) -> "UnifiedJobProcessor":
    """Return the unified job processor with intelligent fallback.

    Fallback order matches SSE:
      gemini-3.6-flash → gemini-3.5-flash-lite → groq → ollama

    Args:
        **kwargs: Passed to UnifiedJobProcessor constructor (e.g. api_key).

    Returns:
        UnifiedJobProcessor instance.
    """
    from llm.unified_provider import UnifiedJobProcessor
    return UnifiedJobProcessor(**kwargs)
