"""Gemini provider with automatic fallback from Flash to Flash-Lite.

Primary: gemini-flash (paid, higher capability)
Fallback: gemini-flash-lite (free tier, higher limits)
Both support Google Search grounding.
"""

import logging

from llm.base import BaseLLMProvider, LLMProviderError
from llm.gemini import GeminiProvider

logger = logging.getLogger(__name__)


class GeminiFallbackProvider(BaseLLMProvider):
    """Gemini provider that falls back from Flash to Flash-Lite on rate limits."""

    def __init__(self, api_key: str | None = None, model: str | None = None):
        self._api_key = (api_key or "").strip()
        self._primary_model = "gemini-2.5-flash"
        self._fallback_model = "gemini-2.5-flash-lite"
        
        # Initialize both providers
        self._primary_provider = GeminiProvider(api_key=api_key, model=self._primary_model)
        self._fallback_provider = GeminiProvider(api_key=api_key, model=self._fallback_model)
        
        # Track which provider was last used successfully
        self._last_successful_provider = None
        self._use_primary = True  # Start with primary by default

    def is_available(self) -> bool:
        """Check if either provider is available."""
        return self._primary_provider.is_available() or self._fallback_provider.is_available()

    def _try_with_fallback(self, method_name: str, *args, **kwargs):
        """Try primary provider first, fall back to Flash-Lite on rate limits."""
        providers_to_try = []
        
        # Determine order of providers to try
        if self._use_primary and self._primary_provider.is_available():
            providers_to_try.append(("primary", self._primary_provider))
        if self._fallback_provider.is_available():
            providers_to_try.append(("fallback", self._fallback_provider))
        
        # If primary is not available, try fallback first
        if not self._use_primary and self._fallback_provider.is_available():
            providers_to_try.insert(0, ("fallback", self._fallback_provider))
        if not self._use_primary and self._primary_provider.is_available():
            providers_to_try.append(("primary", self._primary_provider))

        last_error = None
        for provider_name, provider in providers_to_try:
            try:
                method = getattr(provider, method_name)
                result = method(*args, **kwargs)
                self._last_successful_provider = provider_name
                return result
            except Exception as e:
                last_error = e
                # If it's a rate limit error and we have another provider to try, continue
                if "rate limit" in str(e).lower() and len(providers_to_try) > 1:
                    continue
                raise
        
        # All providers failed
        if last_error:
            raise last_error
        else:
            raise LLMProviderError("No Gemini providers are available or configured")

    def get_token_limits(self) -> dict:
        """Return token limits for Gemini fallback provider."""
        try:
            return self._primary_provider.get_token_limits()
        except Exception:
            try:
                return self._fallback_provider.get_token_limits()
            except Exception:
                return {
                    "context_window": 1_048_576,
                    "max_output_tokens": 65_535,
                    "max_tokens_per_request": 900_000,
                    "requests_per_minute": 4,
                    "requests_per_day": 24,
                    "recommended_batch_size": 50_000,
                }

    def summarize_text(self, text: str, max_chars: int = 300) -> str:
        """Summarize text with automatic fallback."""
        return self._try_with_fallback("summarize_text", text, max_chars)

    @property
    def current_model(self) -> str:
        """Get the currently active model name."""
        if self._last_successful_provider == "primary":
            return self._primary_model
        elif self._last_successful_provider == "fallback":
            return self._fallback_model
        else:
            return self._primary_model  # Default to primary

    def complete(self, prompt: str, model: str | None = None, system: str | None = None) -> str:
        """Generate text with automatic fallback."""
        return self._try_with_fallback("complete", prompt, model, system)
