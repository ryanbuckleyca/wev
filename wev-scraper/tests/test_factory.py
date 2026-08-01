from unittest.mock import MagicMock, patch

import pytest

from llm.base import LLMProviderError
from llm.factory import get_fallback_llm_provider, get_job_summary_provider, get_sse_provider
from llm.gemini_fallback import (
    DEFAULT_GEMINI_LITE,
    DEFAULT_GEMINI_PRIMARY,
    SSEFallbackProvider,
)


def test_get_job_summary_provider_local():
    provider_mock = MagicMock()
    provider_mock.is_available.return_value = True
    with patch("llm.factory._is_local_mode", return_value=True):
        with patch("llm.factory.get_provider", return_value=provider_mock) as mock_get:
            provider = get_job_summary_provider()
            assert provider is provider_mock
            mock_get.assert_called_with(name="local_grounded")


def test_get_job_summary_provider_remote_env():
    provider_mock = MagicMock()
    provider_mock.is_available.return_value = True
    with patch("llm.factory._is_local_mode", return_value=False):
        with patch("llm.factory.get_provider", return_value=provider_mock) as mock_get:
            provider = get_job_summary_provider()
            assert provider is provider_mock
            mock_get.assert_called_with()


def test_get_job_summary_provider_default():
    provider_mock = MagicMock()
    provider_mock.is_available.return_value = True
    with patch("llm.factory._is_local_mode", return_value=False):
        with patch("llm.factory.get_provider", return_value=provider_mock) as mock_get:
            provider = get_job_summary_provider()
            assert provider is provider_mock
            mock_get.assert_called_with()


def test_get_sse_provider_uses_fallback_even_in_local_mode():
    """SSE always prefers the multi-tier chain (Gemini→Groq→Ollama), not Ollama-only."""
    chain = MagicMock(spec=SSEFallbackProvider)
    chain.is_available.return_value = True
    with patch("llm.factory._is_local_mode", return_value=True):
        with patch("llm.gemini_fallback.SSEFallbackProvider", return_value=chain):
            provider = get_sse_provider()
            assert provider is chain


def test_get_sse_provider_returns_fallback_chain():
    chain = MagicMock(spec=SSEFallbackProvider)
    chain.is_available.return_value = True
    with patch("llm.factory._is_local_mode", return_value=False):
        with patch("llm.gemini_fallback.SSEFallbackProvider", return_value=chain):
            provider = get_sse_provider()
            assert provider is chain


def test_get_fallback_llm_provider_returns_chain():
    chain = MagicMock(spec=SSEFallbackProvider)
    chain.is_available.return_value = True
    with patch("llm.factory._is_local_mode", return_value=False):
        with patch("llm.gemini_fallback.SSEFallbackProvider", return_value=chain):
            assert get_fallback_llm_provider() is chain
            assert get_sse_provider() is chain


def test_sse_fallback_tries_flash_then_lite_then_groq_then_ollama():
    flash = MagicMock()
    flash.is_available.return_value = True
    flash.complete.side_effect = LLMProviderError("429 rate limit")

    lite = MagicMock()
    lite.is_available.return_value = True
    lite.complete.side_effect = LLMProviderError("503 overloaded")

    groq = MagicMock()
    groq.is_available.return_value = True
    groq.complete.side_effect = LLMProviderError("quota")

    ollama = MagicMock()
    ollama.is_available.return_value = True
    ollama.complete.return_value = '{"ok": true}'

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=groq), \
         patch("llm.gemini_fallback.LocalGroundedProvider", return_value=ollama), \
         patch("llm.gemini_fallback.fetch_tavily_context", return_value="EVIDENCE"), \
         patch("llm.gemini_fallback.is_tavily_available", return_value=True), \
         patch.dict("os.environ", {"USE_GOOGLE_SEARCH_GROUNDING": "0"}, clear=False):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider(api_key="test-key")

        assert [name for name, _ in provider._providers] == [
            DEFAULT_GEMINI_PRIMARY,
            DEFAULT_GEMINI_LITE,
            "groq",
            "ollama",
        ]

        result = provider.complete("prompt", system="sys", task="sse", search_query="q")
        assert result == '{"ok": true}'
        flash.complete.assert_called_once()
        lite.complete.assert_called_once()
        groq.complete.assert_called_once()
        ollama.complete.assert_called_once()
        # Shared Tavily evidence injected; Google Search / nested Tavily off
        call_kwargs = ollama.complete.call_args.kwargs
        assert call_kwargs.get("use_grounding") is False
        ollama_prompt = ollama.complete.call_args.args[0]
        assert "EVIDENCE" in ollama_prompt
        assert "SUPPORTING WEB EVIDENCE" in ollama_prompt
        assert "Interpretive fields" in ollama_prompt or "SOURCE DESCRIPTION" in ollama_prompt
        assert provider.current_model == "ollama"


def test_sse_fallback_stops_at_flash_lite():
    flash = MagicMock()
    flash.is_available.return_value = True
    flash.complete.side_effect = LLMProviderError("quota exceeded")

    lite = MagicMock()
    lite.is_available.return_value = True
    lite.complete.return_value = "lite-ok"

    groq = MagicMock()
    groq.is_available.return_value = True

    ollama = MagicMock()
    ollama.is_available.return_value = True

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=groq), \
         patch("llm.gemini_fallback.LocalGroundedProvider", return_value=ollama), \
         patch("llm.gemini_fallback.fetch_tavily_context", return_value=""), \
         patch.dict("os.environ", {"USE_GOOGLE_SEARCH_GROUNDING": "0"}, clear=False):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider(api_key="test-key")
        assert provider.complete("prompt", task="sse") == "lite-ok"
        groq.complete.assert_not_called()
        ollama.complete.assert_not_called()
        assert provider.current_model == DEFAULT_GEMINI_LITE


def test_sse_fallback_advances_on_empty_flash_response():
    """Blank Gemini output must not short-circuit Flash → Lite → Groq."""
    flash = MagicMock()
    flash.is_available.return_value = True
    flash.complete.return_value = ""

    lite = MagicMock()
    lite.is_available.return_value = True
    lite.complete.return_value = "   "

    groq = MagicMock()
    groq.is_available.return_value = True
    groq.complete.return_value = '{"ok": true}'

    ollama = MagicMock()
    ollama.is_available.return_value = False

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=groq), \
         patch("llm.gemini_fallback.LocalGroundedProvider", return_value=ollama), \
         patch("llm.gemini_fallback.fetch_tavily_context", return_value=""), \
         patch.dict("os.environ", {"USE_GOOGLE_SEARCH_GROUNDING": "0"}, clear=False):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider(api_key="test-key")
        assert provider.complete("prompt", task="sse") == '{"ok": true}'
        flash.complete.assert_called_once()
        lite.complete.assert_called_once()
        groq.complete.assert_called_once()
        assert provider.current_model == "groq"


def test_sse_fallback_raises_when_all_return_empty():
    flash = MagicMock()
    flash.is_available.return_value = True
    flash.complete.return_value = ""

    lite = MagicMock()
    lite.is_available.return_value = True
    lite.complete.return_value = None

    groq = MagicMock()
    groq.is_available.return_value = True
    groq.complete.return_value = ""

    ollama = MagicMock()
    ollama.is_available.return_value = True
    ollama.complete.return_value = ""

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=groq), \
         patch("llm.gemini_fallback.LocalGroundedProvider", return_value=ollama), \
         patch("llm.gemini_fallback.fetch_tavily_context", return_value=""), \
         patch.dict("os.environ", {"USE_GOOGLE_SEARCH_GROUNDING": "0"}, clear=False):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider(api_key="test-key")
        with pytest.raises(LLMProviderError, match="empty response"):
            provider.complete("prompt", task="sse")


def test_sse_fallback_auto_enables_google_search_when_tavily_empty():
    """Without Tavily evidence (and no env override), Gemini gets Google Search."""
    flash = MagicMock()
    flash.is_available.return_value = True
    flash.complete.return_value = "ok"

    lite = MagicMock()
    lite.is_available.return_value = True

    groq = MagicMock()
    groq.is_available.return_value = True

    ollama = MagicMock()
    ollama.is_available.return_value = True

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=groq), \
         patch("llm.gemini_fallback.LocalGroundedProvider", return_value=ollama), \
         patch("llm.gemini_fallback.fetch_tavily_context", return_value=""), \
         patch("llm.gemini_fallback._google_search_grounding_override", return_value=None):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider(api_key="test-key")
        assert provider.complete("prompt", task="sse", search_query="q") == "ok"
        assert flash.complete.call_args.kwargs.get("use_grounding") is True


def test_sse_fallback_disables_google_search_when_tavily_injected():
    """Shared Tavily evidence present → no double-search on backends."""
    flash = MagicMock()
    flash.is_available.return_value = True
    flash.complete.return_value = "ok"

    lite = MagicMock()
    lite.is_available.return_value = True

    groq = MagicMock()
    groq.is_available.return_value = True

    ollama = MagicMock()
    ollama.is_available.return_value = True

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=groq), \
         patch("llm.gemini_fallback.LocalGroundedProvider", return_value=ollama), \
         patch("llm.gemini_fallback.fetch_tavily_context", return_value="EVIDENCE"), \
         patch("llm.gemini_fallback._google_search_grounding_override", return_value=None):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider(api_key="test-key")
        assert provider.complete("prompt", task="sse", search_query="q") == "ok"
        assert flash.complete.call_args.kwargs.get("use_grounding") is False
        assert "EVIDENCE" in flash.complete.call_args.args[0]
