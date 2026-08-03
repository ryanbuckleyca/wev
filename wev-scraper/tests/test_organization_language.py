"""Tests for organization language classification (V1 + V2 helpers)."""

from unittest.mock import patch

from utils.organization_language import (
    _detect_text_language,
    _discover_locale_urls,
    _url_locale_hints,
    classify_org_language,
    make_llm_language_fn,
)


def test_url_hint_french_path():
    assert _url_locale_hints("https://example.org/fr/a-propos") == "fr"
    assert _url_locale_hints("https://example.org/en/about") == "en"


def test_url_hint_does_not_invent_bilingual_from_single_path():
    assert _url_locale_hints("https://example.org/") is None


def test_classify_defaults_stay_offline_without_setup():
    """Bare call (fetch_web/use_llm default True) must not touch the network.

    The autouse conftest guard stubs the fetch + provider boundaries, so an
    unmocked call resolves to no signal rather than performing real I/O.
    """
    result = classify_org_language(name="Some Org", website="https://example.org")
    assert result.language is None


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


def test_classify_returns_none_when_empty():
    result = classify_org_language(name="X", website=None, use_llm=False)
    assert result.language is None


def test_french_name_alone_does_not_force_english():
    result = classify_org_language(
        name="Aliments Prémont Inc.",
        website=None,
        llm_fn=lambda _name: "fr",
    )
    assert result.language == "fr"
    assert result.source == "llm_name"


def test_website_language_beats_name_llm():
    """Any website language signal beats name LLM (not only bilingual)."""
    with patch("utils.organization_language._neutral_fetch") as mock_fetch:
        mock_fetch.return_value = (
            "<html><body>Notre organisation œuvre pour la solidarité et le "
            "bien commun dans la communauté avec des valeurs de coopération "
            "pour tous les membres de la société.</body></html>",
            "https://exemple.org",
        )
        result = classify_org_language(
            name="Aliments Prémont Inc.",
            website="https://exemple.org",
            fetch_web=True,
            llm_fn=lambda _name: "en",
        )

    assert result.language == "fr"
    assert result.source == "web_text"
    assert result.source != "llm_name"


def test_name_llm_only_when_no_website_signal():
    result = classify_org_language(
        name="Aliments Prémont Inc.",
        website=None,
        llm_fn=lambda _name: "fr",
    )
    assert result.language == "fr"
    assert result.source == "llm_name"


@patch("llm.factory.get_sse_provider")
def test_name_llm_disables_json_object_mode(mock_get_provider):
    provider = mock_get_provider.return_value
    provider.complete.return_value = "fr"

    llm_fn = make_llm_language_fn()

    assert llm_fn is not None
    assert llm_fn("Aliments Prémont Inc.") == "fr"
    provider.complete.assert_called_once()
    assert provider.complete.call_args.kwargs["json_mode"] is False
    assert "substantial English and French wording" in provider.complete.call_args.args[0]


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
        website="https://ex.org",
        fetch_web=True,
        llm_fn=lambda _name: "fr",
    )
    assert result.language == "bilingual"
    assert result.source == "web_dual_probe"


@patch("utils.organization_language._neutral_fetch")
@patch("utils.organization_language._page_has_language")
def test_dual_probe_partial_does_not_force_english(mock_probe, mock_fetch):
    """Partial dual-probe (en ok, fr fail) must not confidently return English."""
    mock_fetch.return_value = (
        """
        <html lang="en"><head>
          <link rel="alternate" hreflang="en" href="https://ex.org/en/" />
          <link rel="alternate" hreflang="fr" href="https://ex.org/fr/" />
        </head><body>Welcome to our organization and community programs for people.</body></html>
        """,
        "https://ex.org/en/",
    )

    def _probe(url, expected):
        return expected == "en"

    mock_probe.side_effect = _probe

    result = classify_org_language(
        name="Acme Corp",
        website="https://ex.org",
        fetch_web=True,
        use_llm=False,
    )
    # Partial dual-probe must fall through — never claim bilingual dual-probe success.
    assert result.source != "web_dual_probe"
    assert result.source == "web_text" or result.language is None
