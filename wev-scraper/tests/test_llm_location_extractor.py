from unittest.mock import MagicMock, patch

from utils.llm_location_extractor import extract_location_single


def test_extract_location_single_uses_default_provider(monkeypatch):
    monkeypatch.delenv("SCRAPER_VPN_MODE", raising=False)
    mock_provider = MagicMock()
    mock_provider.complete.return_value = (
        '[{"municipality": "Toronto", "province": "ON", "work_type": "office"}]'
    )

    with patch("utils.llm_location_extractor.get_provider", return_value=mock_provider) as mock_get_provider:
        result = extract_location_single("Toronto, ON")

    mock_get_provider.assert_called_once_with(name="groq")
    assert result == {
        "municipality": "Toronto",
        "province": "ON",
        "work_type": "office",
    }


def test_extract_location_single_uses_gemini_provider_in_vpn_mode(monkeypatch):
    monkeypatch.setenv("SCRAPER_VPN_MODE", "1")
    mock_provider = MagicMock()
    mock_provider.complete.return_value = (
        '[{"municipality": "Toronto", "province": "ON", "work_type": "office"}]'
    )

    with patch("utils.llm_location_extractor.get_provider", return_value=mock_provider) as mock_get_provider:
        result = extract_location_single("Toronto, ON")

    mock_get_provider.assert_called_once_with(name="gemini")
    assert result == {
        "municipality": "Toronto",
        "province": "ON",
        "work_type": "office",
    }
