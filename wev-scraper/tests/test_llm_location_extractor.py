from unittest.mock import MagicMock, patch

from llm.base import LLMProviderError
from utils.llm_location_extractor import extract_location_single, _extract_batch


def test_extract_location_single_uses_fallback_provider():
    mock_provider = MagicMock()
    mock_provider.complete.return_value = (
        '[{"municipality": "Toronto", "province": "ON", "work_type": "office"}]'
    )

    with patch(
        "utils.llm_location_extractor.get_fallback_llm_provider",
        return_value=mock_provider,
    ) as mock_get:
        result = extract_location_single("Toronto, ON")

    mock_get.assert_called_once_with()
    mock_provider.complete.assert_called_once()
    assert mock_provider.complete.call_args.kwargs.get("json_mode") is False
    assert result == {
        "municipality": "Toronto",
        "province": "ON",
        "work_type": "office",
    }


def test_extract_batch_returns_defaults_when_no_provider():
    with patch(
        "utils.llm_location_extractor.get_fallback_llm_provider",
        return_value=None,
    ):
        results = _extract_batch(["Toronto, ON", "Montreal, QC"])

    assert results == [
        {"municipality": None, "province": None, "work_type": "office"},
        {"municipality": None, "province": None, "work_type": "office"},
    ]


def test_extract_batch_falls_through_provider_errors():
    """Provider chain raises after exhausting backends — batch returns defaults."""
    mock_provider = MagicMock()
    mock_provider.complete.side_effect = LLMProviderError("All SSE providers failed")

    with patch(
        "utils.llm_location_extractor.get_fallback_llm_provider",
        return_value=mock_provider,
    ):
        results = _extract_batch(["Remote"])

    assert results == [{"municipality": None, "province": None, "work_type": "office"}]
