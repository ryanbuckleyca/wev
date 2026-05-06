"""Factory for LLM provider selection.

Default: Groq for most tasks (summarization, location extraction, values tagging).
SSE classification: Gemini Flash → Flash-Lite fallback for grounding.
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
# SSE classification: Uses gemini-2.5-flash → gemini-2.5-flash-lite → groq via unified processor
DEFAULT_MODEL = "groq" # Free tier: ~10 RPM, 12K TPM, 1000 RPH

PROVIDERS: dict[str, type[BaseLLMProvider]] = {
    "gemini": GeminiProvider,
    "groq": GroqProvider,
    "local_grounded": LocalGroundedProvider,
    # Add future providers without changing callers:
    # "openai": OpenAIProvider,
    # "anthropic": AnthropicProvider,
}

def _is_local_mode() -> bool:
    """Return True if running locally (ENV_MODE=local)."""
    return is_local_env()


def get_job_summary_provider() -> BaseLLMProvider | None:
    """Return the LLM provider for job summarization, or None if not configured.

    Priority order:
    1. If ENV_MODE=local: local_grounded (Tavily + Ollama)
    2. Otherwise: LLM_PROVIDER env var or default "groq"
    """
    # Use local grounded provider in local mode
    if _is_local_mode():
        try:
            provider = get_provider(name="local_grounded")
            if provider.is_available():
                return provider
        except Exception:
            pass

    # Fall back to regular provider selection
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
    # Auto-detect provider if not specified
    if name is None:
        # Check for explicit provider choice first
        name = get_stripped_env("LLM_PROVIDER") or None

        # If in local mode and no explicit provider, use local grounded
        if name is None and _is_local_mode():
            name = "local_grounded"
            logger.info("Local mode: using local_grounded provider")

        # Default fallback
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


def get_sse_provider() -> BaseLLMProvider | None:
    """Return provider for SSE classification with fallback.

    Priority order:
    1. If ENV_MODE=local: local_grounded (Tavily + Ollama)
    2. Otherwise: gemini-2.5-flash (10 RPM, grounding)
    3. Fallback: groq (~10 RPM, no grounding)

    Returns:
        Provider instance or None if no provider available.
    """
    # Use local grounded provider in local mode
    if _is_local_mode():
        try:
            provider = get_provider(name="local_grounded")
            if provider.is_available():
                return provider
        except Exception:
            pass

    # Try Gemini first for grounding support
    try:
        provider = get_provider(name="gemini")  # Uses gemini-2.5-flash
        if provider.is_available():
            return provider
    except Exception:
        pass

    # Fallback to Groq (no grounding, but better than nothing)
    try:
        provider = get_provider(name="groq")
        if provider.is_available():
            return provider
    except Exception:
        pass

    return None


def get_unified_processor(**kwargs) -> "UnifiedJobProcessor":
    """Return the unified job processor with intelligent fallback.

    The unified processor handles: summary + raw_skills + values + SSE classification
    in a single LLM call with automatic fallback:
    1. gemini-2.5-flash
    2. gemini-2.5-flash-lite
    3. groq (~10 RPM; same JSON shape including SSE fields, no web search tools)

    When Gemini returns transient errors (503, overload), ``complete_batch`` re-raises so
    this chain can try Groq.

    Args:
        **kwargs: Passed to UnifiedJobProcessor constructor (e.g. api_key).

    Returns:
        UnifiedJobProcessor instance.
    """
    from llm.unified_provider import UnifiedJobProcessor
    return UnifiedJobProcessor(**kwargs)
