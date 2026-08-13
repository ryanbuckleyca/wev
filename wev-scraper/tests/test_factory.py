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
        provider = SSEFallbackProvider()

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
         patch("llm.gemini_fallback.is_tavily_available", return_value=False), \
         patch.dict("os.environ", {"USE_GOOGLE_SEARCH_GROUNDING": "0"}, clear=False):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider()
        result = provider.complete("prompt", task="sse")
        assert result == "lite-ok"
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
         patch("llm.gemini_fallback.is_tavily_available", return_value=False), \
         patch.dict("os.environ", {"USE_GOOGLE_SEARCH_GROUNDING": "0"}, clear=False):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider()
        result = provider.complete("prompt", task="sse")
        assert result == '{"ok": true}'
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
        provider = SSEFallbackProvider()
        with pytest.raises(LLMProviderError, match="empty response"):
            provider.complete("prompt", task="sse")


def test_sse_fallback_never_auto_enables_google_search_when_tavily_empty():
    """Tavily-only: empty evidence must not enable Gemini Google Search."""
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
         patch("llm.gemini_fallback.is_tavily_available", return_value=False), \
         patch("llm.gemini_fallback._google_search_grounding_override", return_value=None):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider()
        result = provider.complete("prompt", task="sse", search_query="q")
        assert result == "ok"
        assert flash.complete.call_args.kwargs.get("use_grounding") is False
        assert "search_query" not in flash.complete.call_args.kwargs


def test_sse_fallback_empty_tavily_forces_non_gemini_grounding_off():
    """Empty shared Tavily must not leave groq/ollama with nested search on."""
    flash = MagicMock()
    flash.is_available.return_value = True
    flash.complete.side_effect = LLMProviderError("quota")

    lite = MagicMock()
    lite.is_available.return_value = True
    lite.complete.side_effect = LLMProviderError("quota")

    groq = MagicMock()
    groq.is_available.return_value = True
    groq.complete.side_effect = LLMProviderError("quota")

    ollama = MagicMock()
    ollama.is_available.return_value = True
    ollama.complete.return_value = '{"ok": true}'

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=groq), \
         patch("llm.gemini_fallback.LocalGroundedProvider", return_value=ollama), \
         patch("llm.gemini_fallback.fetch_tavily_context", return_value=""), \
         patch("llm.gemini_fallback.is_tavily_available", return_value=False), \
         patch.dict("os.environ", {"USE_GOOGLE_SEARCH_GROUNDING": "0"}, clear=False):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider()
        result = provider.complete("prompt", task="sse", search_query="q")
        assert result == '{"ok": true}'

        for backend in (groq, ollama):
            call_kwargs = backend.complete.call_args.kwargs
            assert call_kwargs.get("use_grounding") is False
            assert "search_query" not in call_kwargs


def test_sse_fallback_google_search_opt_in_only_on_gemini():
    """USE_GOOGLE_SEARCH_GROUNDING=1 enables Gemini only — not groq/ollama."""
    flash = MagicMock()
    flash.is_available.return_value = True
    flash.complete.side_effect = LLMProviderError("quota")

    lite = MagicMock()
    lite.is_available.return_value = True
    lite.complete.side_effect = LLMProviderError("quota")

    groq = MagicMock()
    groq.is_available.return_value = True
    groq.complete.return_value = "groq-ok"

    ollama = MagicMock()
    ollama.is_available.return_value = True

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=groq), \
         patch("llm.gemini_fallback.LocalGroundedProvider", return_value=ollama), \
         patch("llm.gemini_fallback.fetch_tavily_context", return_value=""), \
         patch("llm.gemini_fallback.is_tavily_available", return_value=False), \
         patch.dict("os.environ", {"USE_GOOGLE_SEARCH_GROUNDING": "1"}, clear=False):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider()
        result = provider.complete("prompt", task="sse", search_query="q")
        assert result == "groq-ok"
        assert flash.complete.call_args.kwargs.get("use_grounding") is True
        assert lite.complete.call_args.kwargs.get("use_grounding") is True
        assert groq.complete.call_args.kwargs.get("use_grounding") is False
        assert "search_query" not in groq.complete.call_args.kwargs


def test_sse_fallback_gemini_model_override_not_forwarded_to_groq():
    """Gemini model override must reach Gemini only; Groq keeps its default."""
    flash = MagicMock()
    flash.is_available.return_value = True
    flash.complete.side_effect = LLMProviderError("quota")

    lite = MagicMock()
    lite.is_available.return_value = True
    lite.complete.side_effect = LLMProviderError("quota")

    groq = MagicMock()
    groq.is_available.return_value = True
    groq.complete.return_value = "groq-ok"

    ollama = MagicMock()
    ollama.is_available.return_value = True

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=groq), \
         patch("llm.gemini_fallback.LocalGroundedProvider", return_value=ollama), \
         patch("llm.gemini_fallback.fetch_tavily_context", return_value="EVIDENCE"), \
         patch("llm.gemini_fallback.is_tavily_available", return_value=True), \
         patch.dict("os.environ", {"USE_GOOGLE_SEARCH_GROUNDING": "0"}, clear=False):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider()
        result = provider.complete(
            "prompt",
            model="gemini-3.6-flash",
            task="sse",
            search_query="q",
        )
        assert result == "groq-ok"
        assert flash.complete.call_args.kwargs.get("model") == "gemini-3.6-flash"
        assert lite.complete.call_args.kwargs.get("model") == "gemini-3.6-flash"
        assert groq.complete.call_args.kwargs.get("model") is None


def test_sse_fallback_gemini_model_override_not_forwarded_to_ollama():
    """Gemini model override must not be passed when falling through to Ollama."""
    flash = MagicMock()
    flash.is_available.return_value = True
    flash.complete.side_effect = LLMProviderError("quota")

    lite = MagicMock()
    lite.is_available.return_value = True
    lite.complete.side_effect = LLMProviderError("quota")

    groq = MagicMock()
    groq.is_available.return_value = True
    groq.complete.side_effect = LLMProviderError("quota")

    ollama = MagicMock()
    ollama.is_available.return_value = True
    ollama.complete.return_value = "ollama-ok"

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=groq), \
         patch("llm.gemini_fallback.LocalGroundedProvider", return_value=ollama), \
         patch("llm.gemini_fallback.fetch_tavily_context", return_value="EVIDENCE"), \
         patch("llm.gemini_fallback.is_tavily_available", return_value=True), \
         patch.dict("os.environ", {"USE_GOOGLE_SEARCH_GROUNDING": "0"}, clear=False):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider()
        result = provider.complete(
            "prompt",
            model="gemini-3.5-flash-lite",
            task="sse",
            search_query="q",
        )
        assert result == "ollama-ok"
        assert flash.complete.call_args.kwargs.get("model") == "gemini-3.5-flash-lite"
        assert groq.complete.call_args.kwargs.get("model") is None
        assert ollama.complete.call_args.kwargs.get("model") is None


def test_sse_fallback_forwards_use_grounding_false():
    """Explicit use_grounding=False must reach backends (not popped)."""
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
         patch("llm.gemini_fallback.fetch_tavily_context") as mock_tavily, \
         patch("llm.gemini_fallback.is_tavily_available", return_value=False):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider()
        result = provider.complete(
            "prompt",
            task="sse",
            use_grounding=False,
            search_query="should-not-fetch",
        )
        assert result == "ok"
        mock_tavily.assert_not_called()
        assert flash.complete.call_args.kwargs.get("use_grounding") is False


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
         patch("llm.gemini_fallback.is_tavily_available", return_value=True), \
         patch("llm.gemini_fallback._google_search_grounding_override", return_value=None):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider()
        result = provider.complete("prompt", task="sse", search_query="q")
        assert result == "ok"
        assert flash.complete.call_args.kwargs.get("use_grounding") is False
        assert "EVIDENCE" in flash.complete.call_args.args[0]


def test_sse_fallback_truncates_cloud_grounded_prompt_keeps_ollama_budget():
    """Cloud path caps combined prompt; Ollama still uses evidence budget only."""
    from llm.tavily_grounding import inject_grounding_evidence, ollama_evidence_budget, trim_evidence

    flash = MagicMock()
    flash.is_available.return_value = True
    flash.complete.side_effect = LLMProviderError("quota")

    lite = MagicMock()
    lite.is_available.return_value = True
    lite.complete.side_effect = LLMProviderError("quota")

    groq = MagicMock()
    groq.is_available.return_value = True
    groq.complete.side_effect = LLMProviderError("quota")

    ollama = MagicMock()
    ollama.is_available.return_value = True
    ollama.complete.return_value = '{"ok": true}'

    # Oversized prompt + evidence so cloud truncate kicks in under a tiny limit.
    huge_prompt = "HEAD_RULES " + ("X" * 500) + " TAIL_JSON"
    huge_evidence = "EVIDENCE_START " + ("Y" * 800) + " EVIDENCE_END"
    cloud_limit = 400
    ollama_budget = 120

    with patch("llm.gemini_fallback.GeminiProvider") as mock_gemini, \
         patch("llm.gemini_fallback.GroqProvider", return_value=groq), \
         patch("llm.gemini_fallback.LocalGroundedProvider", return_value=ollama), \
         patch("llm.gemini_fallback.fetch_tavily_context", return_value=huge_evidence), \
         patch("llm.gemini_fallback.is_tavily_available", return_value=True), \
         patch.dict(
             "os.environ",
             {
                 "USE_GOOGLE_SEARCH_GROUNDING": "0",
                 "MAX_GROUNDED_PROMPT_CHARS": str(cloud_limit),
                 "TAVILY_OLLAMA_MAX_CHARS": str(ollama_budget),
             },
             clear=False,
         ):
        mock_gemini.side_effect = [flash, lite]
        provider = SSEFallbackProvider()
        result = provider.complete(huge_prompt, task="sse", search_query="q")
        assert result == '{"ok": true}'

        # Cloud backends receive head+tail truncated combined prompts.
        for backend in (flash, lite, groq):
            cloud_prompt = backend.complete.call_args.args[0]
            assert len(cloud_prompt) <= cloud_limit
            assert "HEAD_RULES" in cloud_prompt or "SUPPORTING WEB EVIDENCE" in cloud_prompt
            assert "TAIL_JSON" in cloud_prompt
            assert "truncated" in cloud_prompt.lower()

        # Ollama path: evidence trimmed to budget, then injected — no cloud cap.
        ollama_prompt = ollama.complete.call_args.args[0]
        expected_ev = trim_evidence(huge_evidence, max_chars=ollama_evidence_budget())
        assert len(expected_ev) <= ollama_budget + 1  # ellipsis
        assert ollama_prompt == inject_grounding_evidence(huge_prompt, expected_ev)
        assert len(ollama_prompt) > cloud_limit  # not subject to cloud prompt cap
        assert "EVIDENCE_START" in ollama_prompt
        assert "Y" * 800 not in ollama_prompt  # middle of evidence trimmed
