from unittest.mock import MagicMock, patch

import pytest

from llm.base import LLMProviderError
from llm.factory import get_fallback_llm_provider, get_job_summary_provider, get_sse_provider
from llm.gemini_fallback import (
    DEFAULT_GEMINI_LITE,
    DEFAULT_GEMINI_PRIMARY,
    SSEFallbackProvider,
    abbreviate_llm_error,
    classify_llm_failure,
)
from llm.tavily_grounding import TavilyUnavailableError


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


def test_sse_fallback_tries_flash_then_lite_then_groq_then_cerebras():
    flash = MagicMock()
    flash.is_available.return_value = True
    flash.complete.side_effect = LLMProviderError("429 rate limit")

    lite = MagicMock()
    lite.is_available.return_value = True
    lite.complete.side_effect = LLMProviderError("503 overloaded")

    groq = MagicMock()
    groq.is_available.return_value = True
    groq.complete.side_effect = LLMProviderError("quota")


    cerebras = MagicMock()
    cerebras.is_available.return_value = True
    cerebras.complete.return_value = '{"ok": true}'

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=groq), \
         patch("llm.gemini_fallback.CerebrasProvider", return_value=cerebras), \
         patch("llm.gemini_fallback.LocalGroundedProvider") as mock_ollama, \
         patch("llm.gemini_fallback.fetch_tavily_context", return_value="EVIDENCE"), \
         patch("llm.gemini_fallback.require_tavily"), \
         patch("llm.gemini_fallback.is_tavily_available", return_value=True), \
         patch.dict("os.environ", {"USE_GOOGLE_SEARCH_GROUNDING": "0"}, clear=False):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider(api_key="test-key")

        assert [name for name, _ in provider._providers] == [
            DEFAULT_GEMINI_PRIMARY,
            DEFAULT_GEMINI_LITE,
            "groq",
            "cerebras",
        ]
        mock_ollama.assert_not_called()

        result = provider.complete("prompt", system="sys", task="sse", search_query="q")
        assert result == '{"ok": true}'
        flash.complete.assert_called_once()
        lite.complete.assert_called_once()
        groq.complete.assert_called_once()
        cerebras.complete.assert_called_once()
        call_kwargs = cerebras.complete.call_args.kwargs
        assert call_kwargs.get("use_grounding") is False
        cerebras_prompt = cerebras.complete.call_args.args[0]
        assert "EVIDENCE" in cerebras_prompt
        assert "SUPPORTING WEB EVIDENCE" in cerebras_prompt
        assert "Interpretive fields" in cerebras_prompt or "SOURCE DESCRIPTION" in cerebras_prompt
        assert provider.current_model == "cerebras"




def test_sse_fallback_stops_at_flash_lite():
    flash = MagicMock()
    flash.is_available.return_value = True
    flash.complete.side_effect = LLMProviderError("quota exceeded")

    lite = MagicMock()
    lite.is_available.return_value = True
    lite.complete.return_value = "lite-ok"

    unavailable = MagicMock()
    unavailable.is_available.return_value = False

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=unavailable), \
         patch("llm.gemini_fallback.CerebrasProvider", return_value=unavailable), \
         patch("llm.gemini_fallback.LocalGroundedProvider", return_value=unavailable), \
         patch("llm.gemini_fallback.fetch_tavily_context", return_value=""), \
         patch("llm.gemini_fallback.require_tavily"), \
         patch.dict("os.environ", {"USE_GOOGLE_SEARCH_GROUNDING": "0"}, clear=False):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider(api_key="test-key")
        assert provider.complete("prompt", task="sse") == "lite-ok"
        assert provider.current_model == DEFAULT_GEMINI_LITE


def test_sse_fallback_logs_429_then_tries_lite(caplog):
    """Primary free-tier daily quota → immediately try lite; success log names lite."""
    import logging

    flash = MagicMock()
    flash.is_available.return_value = True
    flash.complete.side_effect = LLMProviderError(
        "429 RESOURCE_EXHAUSTED You exceeded your current quota, please check your plan "
        "and billing details. FreeTierQuotaExhausted free_tier daily "
        + ("x" * 2000)  # giant Google payload must not dominate the log line
    )

    lite = MagicMock()
    lite.is_available.return_value = True
    lite.complete.return_value = '{"ok": true}'

    unavailable = MagicMock()
    unavailable.is_available.return_value = False

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=unavailable), \
         patch("llm.gemini_fallback.CerebrasProvider", return_value=unavailable), \
         patch("llm.gemini_fallback.LocalGroundedProvider", return_value=unavailable), \
         patch("llm.gemini_fallback.fetch_tavily_context", return_value=""), \
         patch("llm.gemini_fallback.require_tavily"), \
         patch.dict("os.environ", {"USE_GOOGLE_SEARCH_GROUNDING": "0"}, clear=False), \
         caplog.at_level(logging.INFO, logger="llm.gemini_fallback"):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider(api_key="test-key")
        assert provider.complete("prompt", task="sse") == '{"ok": true}'
        assert provider.current_model == DEFAULT_GEMINI_LITE
        flash.complete.assert_called_once()
        lite.complete.assert_called_once()

    messages = [r.getMessage() for r in caplog.records]
    advance = [
        m for m in messages
        if f"SSE fallback: {DEFAULT_GEMINI_PRIMARY} hit" in m
        and "→ trying" in m
        and DEFAULT_GEMINI_LITE in m
    ]
    assert advance, f"expected advance log, got: {messages}"
    assert "free-tier daily quota (429)" in advance[0]
    assert "xxxx" not in advance[0]  # truncated / classified, not raw dump
    assert any(
        f"SSE fallback: {DEFAULT_GEMINI_LITE} succeeded" in m for m in messages
    )


def test_classify_llm_failure_prefers_quota_reason():
    assert classify_llm_failure(
        LLMProviderError("429 free_tier daily quota RESOURCE_EXHAUSTED")
    ) == "free-tier daily quota (429)"
    assert classify_llm_failure(LLMProviderError("503 overloaded")) == "503 overloaded"
    assert len(abbreviate_llm_error(LLMProviderError("y" * 500))) <= 160


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

    unavailable = MagicMock()
    unavailable.is_available.return_value = False

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=groq), \
         patch("llm.gemini_fallback.CerebrasProvider", return_value=unavailable), \
         patch("llm.gemini_fallback.LocalGroundedProvider", return_value=unavailable), \
         patch("llm.gemini_fallback.fetch_tavily_context", return_value=""), \
         patch("llm.gemini_fallback.require_tavily"), \
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

    empty = MagicMock()
    empty.is_available.return_value = True
    empty.complete.return_value = ""

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=empty), \
         patch("llm.gemini_fallback.CerebrasProvider", return_value=empty), \
         patch("llm.gemini_fallback.LocalGroundedProvider", return_value=empty), \
         patch("llm.gemini_fallback.fetch_tavily_context", return_value=""), \
         patch("llm.gemini_fallback.require_tavily"), \
         patch.dict("os.environ", {"USE_GOOGLE_SEARCH_GROUNDING": "0"}, clear=False):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider(api_key="test-key")
        with pytest.raises(LLMProviderError, match="empty response"):
            provider.complete("prompt", task="sse")


def test_sse_fallback_hard_fails_when_tavily_unavailable():
    """Grounded SSE must not continue with empty evidence if Tavily is broken."""
    flash = MagicMock()
    flash.is_available.return_value = True
    flash.complete.return_value = '{"ok": true}'

    with patch("llm.gemini_fallback.GeminiProvider", return_value=flash), \
         patch("llm.gemini_fallback.GroqProvider") as mock_groq, \
         patch("llm.gemini_fallback.CerebrasProvider") as mock_cerebras, \
         patch("llm.gemini_fallback.LocalGroundedProvider") as mock_ollama, \
         patch(
             "llm.gemini_fallback.require_tavily",
             side_effect=TavilyUnavailableError("No module named 'tavily'"),
         ), \
         patch("llm.gemini_fallback.fetch_tavily_context") as mock_fetch, \
         patch.dict("os.environ", {"USE_GOOGLE_SEARCH_GROUNDING": "0"}, clear=False):
        for m in (mock_groq, mock_cerebras, mock_ollama):
            inst = MagicMock()
            inst.is_available.return_value = False
            m.return_value = inst
        provider = SSEFallbackProvider(api_key="test-key")
        with pytest.raises(TavilyUnavailableError, match="tavily"):
            provider.complete("prompt", task="sse", search_query="q")
        mock_fetch.assert_not_called()
        flash.complete.assert_not_called()
