from unittest.mock import MagicMock, patch

from llm.factory import get_provider


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



