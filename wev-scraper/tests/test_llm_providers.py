from unittest.mock import MagicMock, patch

import pytest

from llm.base import LLMProviderError, error_suggests_try_next_provider
from llm.factory import get_provider


@pytest.fixture(autouse=True)
def enable_local_fallback(monkeypatch):
    monkeypatch.setenv("ENABLE_LOCAL_FALLBACK", "1")

def test_error_suggests_try_next_provider_503():
    err = LLMProviderError(
        "503 UNAVAILABLE high demand try again later"
    )
    assert error_suggests_try_next_provider(err) is True


def test_error_suggests_try_next_provider_403():
    assert error_suggests_try_next_provider(LLMProviderError("403 PERMISSION_DENIED")) is False


def test_get_provider_local_mode():
    """get_provider should return LocalGroundedProvider when in local mode."""
    mock_ollama = MagicMock()
    mock_ollama.list.return_value = MagicMock(models=[MagicMock(model="mistral")])

    with patch("llm.factory._is_local_mode", return_value=True), \
         patch.dict("sys.modules", {"ollama": mock_ollama, "tavily": MagicMock()}), \
         patch("llm.local_grounded.LocalGroundedProvider._check_tavily", return_value=True), \
         patch("llm.local_grounded.LocalGroundedProvider._check_ollama", return_value=True):
        prov = get_provider()
        from llm.local_grounded import LocalGroundedProvider
        assert isinstance(prov, LocalGroundedProvider)


def test_get_provider_explicit_local():
    """get_provider should return LocalGroundedProvider when requested explicitly."""
    mock_ollama = MagicMock()
    mock_ollama.list.return_value = MagicMock(models=[MagicMock(model="mistral")])

    with patch.dict("sys.modules", {"ollama": mock_ollama, "tavily": MagicMock()}), \
         patch("llm.local_grounded.LocalGroundedProvider._check_tavily", return_value=True), \
         patch("llm.local_grounded.LocalGroundedProvider._check_ollama", return_value=True):
        prov = get_provider(name="local_grounded")
        from llm.local_grounded import LocalGroundedProvider
        assert isinstance(prov, LocalGroundedProvider)


def test_gemini_provider_timeout_clamping():
    """GeminiProvider should clamp GEMINI_CALL_TIMEOUT_SEC to a minimum of 1 second."""
    from llm.gemini import GeminiProvider

    with patch.dict("os.environ", {"GEMINI_CALL_TIMEOUT_SEC": "0", "GEMINI_API_KEY": "test-key-1234"}):
        provider = GeminiProvider()
        assert provider._call_timeout_sec == 1

    with patch.dict("os.environ", {"GEMINI_CALL_TIMEOUT_SEC": "-10", "GEMINI_API_KEY": "test-key-1234"}):
        provider = GeminiProvider()
        assert provider._call_timeout_sec == 1

    with patch.dict("os.environ", {"GEMINI_CALL_TIMEOUT_SEC": "invalid", "GEMINI_API_KEY": "test-key-1234"}):
        provider = GeminiProvider()
        assert provider._call_timeout_sec == 90

    with patch.dict("os.environ", {"GEMINI_CALL_TIMEOUT_SEC": "45", "GEMINI_API_KEY": "test-key-1234"}):
        provider = GeminiProvider()
        assert provider._call_timeout_sec == 45




