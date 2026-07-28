"""Tests for organization language classification (V1 + V2 helpers)."""

from unittest.mock import patch

from utils.organization_language import (
    _detect_text_language,
    _discover_locale_urls,
    _url_locale_hints,
    classify_org_language,
)


def test_url_hint_french_path():
    assert _url_locale_hints("https://example.org/fr/a-propos") == "fr"
    assert _url_locale_hints("https://example.org/en/about") == "en"


def test_url_hint_does_not_invent_bilingual_from_single_path():
    assert _url_locale_hints("https://example.org/") is None


def test_detect_french_mission():
    text = (
        "Notre organisation œuvre pour la solidarité et le bien commun. "
        "Nous soutenons les entreprises d'économie sociale dans la communauté "
        "avec des valeurs de coopération et de justice sociale pour tous."
    )
    result = _detect_text_language(text)
    assert result.language == "fr"


def test_detect_english_mission():
    text = (
        "Our organization works for the common good and community wellbeing. "
        "We support social enterprises with values of cooperation and justice "
        "for people and the planet across the region."
    )
    result = _detect_text_language(text)
    assert result.language == "en"


def test_classify_prefers_stored_french_text():
    result = classify_org_language(
        name="Centre communautaire",
        description=(
            "Le centre offre des services pour les familles et les jeunes "
            "dans la communauté avec une mission de solidarité et d'entraide "
            "pour les personnes vulnérables de notre quartier."
        ),
        mission_statement=None,
        website="https://example.org",
        fetch_web=False,
    )
    assert result.language == "fr"


def test_classify_returns_none_when_empty():
    result = classify_org_language(name="X", description=None, website=None)
    assert result.language is None


def test_discover_hreflang_pair():
    html = """
    <html><head>
      <link rel="alternate" hreflang="en" href="https://ex.org/en/" />
      <link rel="alternate" hreflang="fr-ca" href="https://ex.org/fr/" />
    </head></html>
    """
    found = _discover_locale_urls(html, "https://ex.org/")
    assert "en" in found and "fr" in found


def test_discover_does_not_seed_locale_probes_without_signal():
    found = _discover_locale_urls("<html><body>Hello</body></html>", "https://ex.org/")
    assert found == {}


def test_discover_adds_only_missing_counterpart():
    html = """
    <html><head>
      <link rel="alternate" hreflang="en" href="https://ex.org/en/" />
    </head></html>
    """
    found = _discover_locale_urls(html, "https://ex.org/")
    assert found["en"] == "https://ex.org/en/"
    assert found["fr"] == "https://ex.org/fr"


def test_is_safe_public_url_blocks_private_and_metadata():
    from utils.organization_language import _is_safe_public_url

    assert _is_safe_public_url("https://127.0.0.1/") is False
    assert _is_safe_public_url("http://192.168.1.10/page") is False
    assert _is_safe_public_url("http://169.254.169.254/latest/meta-data") is False
    assert _is_safe_public_url("http://localhost/admin") is False
    assert _is_safe_public_url("ftp://example.org/") is False


@patch("utils.organization_language._neutral_fetch")
@patch("utils.organization_language._page_has_language")
def test_classify_web_dual_probe_bilingual(mock_probe, mock_fetch):
    mock_fetch.return_value = (
        """
        <html lang="en"><head>
          <link rel="alternate" hreflang="en" href="https://ex.org/en/" />
          <link rel="alternate" hreflang="fr" href="https://ex.org/fr/" />
        </head><body>Welcome to our organization and community programs.</body></html>
        """,
        "https://ex.org/en/",
    )
    mock_probe.side_effect = lambda url, expected: True

    result = classify_org_language(
        name="Acme",
        description="Short",
        website="https://ex.org",
        fetch_web=True,
    )
    assert result.language == "bilingual"
    assert result.source == "web_dual_probe"
