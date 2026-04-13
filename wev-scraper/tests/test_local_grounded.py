import sys
from unittest.mock import MagicMock, patch

import pytest

# Create persistent mocks for optional dependencies
mock_ollama = MagicMock()
mock_tavily = MagicMock()

# Apply the mocks to sys.modules for the duration of this module's execution
def setup_module(module):
    sys.modules["ollama"] = mock_ollama
    sys.modules["tavily"] = mock_tavily

def teardown_module(module):
    if "ollama" in sys.modules and sys.modules["ollama"] is mock_ollama:
        del sys.modules["ollama"]
    if "tavily" in sys.modules and sys.modules["tavily"] is mock_tavily:
        del sys.modules["tavily"]

from llm.local_grounded import LocalGroundedProvider  # noqa: E402


@pytest.fixture
def provider():
    return LocalGroundedProvider()

def test_local_grounded_is_available(provider):
    """Should be available if Tavily key exists and Ollama has the model."""
    provider._ollama_available = None
    provider._tavily_available = None

    with patch.object(provider, "_check_tavily", return_value=True), \
         patch.object(provider, "_check_ollama", return_value=True):
        assert provider.is_available() is True

def test_local_grounded_is_not_available_missing_model(provider):
    """Should return False if model is missing."""
    with patch("llm.local_grounded.os.getenv", return_value="key"), \
         patch("ollama.list") as mock_list:

        mock_list.return_value = MagicMock(models=[MagicMock(model="llama2")])
        assert provider.is_available() is False

def test_local_grounded_complete_no_grounding(provider):
    """Standard completion without grounding."""
    with patch.object(provider, "_check_ollama", return_value=True), \
         patch("ollama.generate") as mock_gen:

        mock_gen.return_value = {"response": "2+2=4"}

        response = provider.complete("What is 2+2?", task="summarization")
        assert response == "2+2=4"
        mock_gen.assert_called_once()
        # Verify no grounding block was added
        assert "Using these search results as context" not in mock_gen.call_args[1]["prompt"]

def test_local_grounded_complete_with_grounding(provider):
    """Completion with grounding for SSE task."""
    with patch.object(provider, "_check_ollama", return_value=True), \
         patch.object(provider, "_check_tavily", return_value=True), \
         patch.object(provider, "_search_context", return_value="Some context"), \
         patch("ollama.generate") as mock_gen:

        mock_gen.return_value = {"response": "SSE confirmed"}

        response = provider.complete("Is it SSE?", task="sse")
        assert response == "SSE confirmed"

        # Verify grounding was used
        prompt = mock_gen.call_args[1]["prompt"]
        assert "Using these search results as context" in prompt
        assert "Some context" in prompt
        assert "Is it SSE?" in prompt

def test_local_grounded_search_query_param(provider):
    """Verify search_query kwarg is prioritized over prompt prefix."""
    with patch.object(provider, "_check_ollama", return_value=True), \
         patch.object(provider, "_check_tavily", return_value=True), \
         patch.object(provider, "_search_context") as mock_search, \
         patch("ollama.generate"):

        provider.complete("Long prompt...", task="sse", search_query="Target Org")
        mock_search.assert_called_once_with("Target Org")

def test_token_limits(provider):
    """Verify token limits are returned correctly."""
    limits = provider.get_token_limits()
    assert limits["context_window"] == 8_192
    assert limits["recommended_batch_size"] == 1
