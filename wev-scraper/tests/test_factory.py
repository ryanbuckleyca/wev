from unittest.mock import MagicMock, patch

import pytest

from llm.base import LLMProviderError
from llm.factory import get_fallback_llm_provider, get_job_summary_provider, get_sse_provider
from llm.gemini_fallback import SSEFallbackProvider


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


def test_get_sse_provider_local():
    provider_mock = MagicMock()
    provider_mock.is_available.return_value = True
    with patch("llm.factory._is_local_mode", return_value=True):
        with patch("llm.factory.get_provider", return_value=provider_mock) as mock_get:
            provider = get_sse_provider()
            assert provider is provider_mock
            mock_get.assert_called_with(name="local_grounded")


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


def test_sse_fallback_tries_flash_then_lite_then_groq():
    flash = MagicMock()
    flash.is_available.return_value = True
    flash.complete.side_effect = LLMProviderError("429 rate limit")

    lite = MagicMock()
    lite.is_available.return_value = True
    lite.complete.side_effect = LLMProviderError("503 overloaded")

    groq = MagicMock()
    groq.is_available.return_value = True
    groq.complete.return_value = '{"ok": true}'

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=groq):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider(api_key="test-key")

    assert [name for name, _ in provider._providers] == [
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "groq",
    ]

    result = provider.complete("prompt", system="sys", task="sse", search_query="q")
    assert result == '{"ok": true}'
    flash.complete.assert_called_once()
    lite.complete.assert_called_once()
    groq.complete.assert_called_once_with(
        "prompt", model=None, system="sys", task="sse", search_query="q",
    )
    assert provider.current_model == "groq"


def test_sse_fallback_stops_at_flash_lite():
    flash = MagicMock()
    flash.is_available.return_value = True
    flash.complete.side_effect = LLMProviderError("quota exceeded")

    lite = MagicMock()
    lite.is_available.return_value = True
    lite.complete.return_value = "lite-ok"

    groq = MagicMock()
    groq.is_available.return_value = True

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=groq):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider(api_key="test-key")

    assert provider.complete("prompt") == "lite-ok"
    groq.complete.assert_not_called()
    assert provider.current_model == "gemini-2.5-flash-lite"


def test_sse_fallback_advances_on_empty_flash_response():
    """Blank Gemini output must not short-circuit Flash → Lite → Groq."""
    flash = MagicMock()
    flash.is_available.return_value = True
    flash.complete.return_value = ""

    lite = MagicMock()
    lite.is_available.return_value = True
    lite.complete.return_value = "   "  # whitespace-only also unusable

    groq = MagicMock()
    groq.is_available.return_value = True
    groq.complete.return_value = '{"ok": true}'

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=groq):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider(api_key="test-key")

    assert provider.complete("prompt") == '{"ok": true}'
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

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=groq):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider(api_key="test-key")

    with pytest.raises(LLMProviderError, match="empty response"):
        provider.complete("prompt")
