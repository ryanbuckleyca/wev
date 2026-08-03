"""Unit tests for website confirmation gate."""

from unittest.mock import MagicMock, patch

from utils.website_verify import (
    confirm_website,
    evidence_mentions_location,
    has_geographic_conflict,
    host_in_evidence,
    is_foreign_gov_host,
    page_mentions_org_name,
    url_host,
    urls_from_evidence_text,
    verify_website_live,
)


def test_url_host_strips_www():
    assert url_host("https://www.example.org/about") == "example.org"
    assert url_host("example.org") == "example.org"
    assert url_host("") == ""
    assert url_host(None) == ""


def test_host_in_evidence_matches_subdomain():
    evidence = ["https://news.example.org/story", "https://linkedin.com/company/x"]
    assert host_in_evidence("https://www.example.org", evidence) is True
    assert host_in_evidence("https://other.org", evidence) is False


def test_urls_from_evidence_text_extracts_links():
    text = "Acme | https://acme.org/about\nSnippet\n\nOther | http://news.ca/x"
    assert urls_from_evidence_text(text) == [
        "https://acme.org/about",
        "http://news.ca/x",
    ]


@patch("utils.website_verify.verify_website_live", return_value=True)
def test_confirm_website_rejects_invented_host(mock_live):
    evidence = ["https://linkedin.com/company/acme", "https://glassdoor.com/acme"]
    assert (
        confirm_website(
            "https://acme-totally-made-up.org",
            evidence_urls=evidence,
        )
        is None
    )
    mock_live.assert_not_called()


@patch("utils.website_verify.verify_website_live", return_value=True)
def test_confirm_website_accepts_host_in_evidence(mock_live):
    evidence = ["https://www.acme.org/mission", "https://news.ca/story"]
    assert (
        confirm_website("https://acme.org", evidence_urls=evidence)
        == "https://acme.org"
    )
    mock_live.assert_called_once()


@patch("utils.website_verify.verify_website_live", return_value=True)
def test_confirm_website_accepts_known_website_without_evidence(mock_live):
    assert (
        confirm_website(
            "https://known.org",
            evidence_urls=[],
            known_website="https://www.known.org/",
        )
        == "https://known.org"
    )
    mock_live.assert_called_once()


@patch("utils.website_verify.verify_website_live", return_value=False)
def test_confirm_website_rejects_dead_host_even_in_evidence(mock_live):
    evidence = ["https://dead-example.org/"]
    assert (
        confirm_website("https://dead-example.org", evidence_urls=evidence) is None
    )
    mock_live.assert_called_once()


def test_confirm_website_returns_none_for_empty():
    assert confirm_website(None, evidence_urls=["https://x.org"]) is None
    assert confirm_website("  ", evidence_urls=["https://x.org"]) is None


@patch("utils.website_verify._dns_resolves", return_value=True)
def test_verify_website_live_accepts_2xx(mock_dns):
    resp = MagicMock()
    resp.status_code = 200
    with patch("utils.website_verify.requests.Session") as mock_session_cls:
        session = MagicMock()
        mock_session_cls.return_value = session
        session.head.return_value = resp
        assert verify_website_live("https://ok.example") is True
        assert session.trust_env is False


@patch("utils.website_verify._dns_resolves", return_value=True)
def test_verify_website_live_accepts_403(mock_dns):
    resp = MagicMock()
    resp.status_code = 403
    with patch("utils.website_verify.requests.Session") as mock_session_cls:
        session = MagicMock()
        mock_session_cls.return_value = session
        session.head.return_value = resp
        assert verify_website_live("https://blocked.example") is True


@patch("utils.website_verify._dns_resolves", return_value=False)
def test_verify_website_live_fails_without_dns(mock_dns):
    assert verify_website_live("https://no-dns.invalid") is False


def test_is_foreign_gov_host_rejects_us_gov_for_canadian_job():
    assert is_foreign_gov_host("https://gbi.georgia.gov", province="QC") is True
    assert is_foreign_gov_host("https://fbi.gov", province="ON") is True
    assert is_foreign_gov_host("https://aurora.ca", province="ON") is False
    assert is_foreign_gov_host("https://gbi.georgia.gov", province=None) is False
    assert is_foreign_gov_host("https://gbi.georgia.gov", province="GA") is False


def test_has_geographic_conflict_ohio_vs_ontario():
    assert (
        has_geographic_conflict(
            "Family farm in Brookville, Ohio since 1890",
            municipality="Rockwood",
            province="ON",
            site_title="Foxhole Farm Ohio",
        )
        is True
    )


def test_has_geographic_conflict_georgia_vs_quebec():
    assert (
        has_geographic_conflict(
            "Georgia Bureau of Investigation headquarters in Atlanta",
            municipality="Montreal",
            province="QC",
            site_title="GBI — Georgia",
        )
        is True
    )


def test_has_geographic_conflict_redeemed_by_canadian_city():
    # Mentions Ohio in passing but also Rockwood Ontario — not a conflict.
    assert (
        has_geographic_conflict(
            "Rockwood Ontario CSA inspired by Ohio farm models",
            municipality="Rockwood",
            province="ON",
            site_title="Foxhole Farm Rockwood",
        )
        is False
    )


def test_has_geographic_conflict_skips_non_canadian_province():
    assert (
        has_geographic_conflict(
            "Located in Atlanta, Georgia",
            municipality="Atlanta",
            province="GA",
        )
        is False
    )


@patch("utils.website_verify.verify_website_live", return_value=True)
def test_confirm_website_rejects_foreign_gov_for_canadian_province(mock_live):
    evidence = ["https://gbi.georgia.gov/about"]
    assert (
        confirm_website(
            "https://gbi.georgia.gov",
            evidence_urls=evidence,
            province="QC",
            municipality="Montreal",
        )
        is None
    )
    mock_live.assert_not_called()


@patch("utils.website_verify.verify_website_live", return_value=True)
def test_confirm_website_rejects_geo_conflict_on_homepage(mock_live):
    evidence = ["https://foxholefarmohio.com/"]
    assert (
        confirm_website(
            "https://foxholefarmohio.com",
            evidence_urls=evidence,
            province="ON",
            municipality="Rockwood",
            site_title="Foxhole Farm Ohio",
            site_text="Welcome to our Brookville, Ohio farm",
        )
        is None
    )
    mock_live.assert_called_once()


def test_evidence_mentions_location():
    assert evidence_mentions_location(
        "Foxhole Farm Rockwood",
        "CSA in Rockwood Ontario",
        municipality="Rockwood",
        province="ON",
    )
    assert not evidence_mentions_location(
        "Foxhole Farm Ohio",
        "Brookville Ohio vegetables",
        municipality="Rockwood",
        province="ON",
    )


@patch("utils.website_verify.verify_website_live", return_value=True)
def test_confirm_website_rejects_missing_org_name_tokens(mock_live):
    """Nouryon Magog plant must not confirm for a Québec numbered corp."""
    evidence = ["https://www.nouryon.com/locations/magog"]
    nouryon_text = (
        "Nouryon Magog plant manufactures specialty chemicals in Magog, Quebec. "
        "Welcome to our Magog site."
    )
    assert (
        confirm_website(
            "https://www.nouryon.com",
            evidence_urls=evidence,
            province="QC",
            municipality="Magog",
            site_title="Nouryon Magog",
            site_text=nouryon_text,
            org_raw_name="9076-5215 QUÉBEC Inc.",
        )
        is None
    )
    mock_live.assert_called_once()


def test_page_mentions_org_name_numbered_corp_requires_both_parts():
    assert not page_mentions_org_name(
        "Nouryon Magog specialty chemicals plant",
        org_raw_name="9076-5215 QUÉBEC Inc.",
        site_title="Nouryon Magog",
    )
    assert page_mentions_org_name(
        "Corporation 9076-5215 Québec also known as Rembourrage Orford",
        org_raw_name="9076-5215 QUÉBEC Inc.",
    )


def test_page_mentions_org_name_short_brand_pages():
    """Weak fillers stripped so brand homepage tokens alone can confirm."""
    assert page_mentions_org_name(
        "soutien comptable et administratif",
        org_raw_name="Réseau Télescope",
        site_title="Télescope - soutien comptable",
    )
    assert page_mentions_org_name(
        "Green roofs and living walls",
        org_raw_name="The Architek Group",
        site_title="Home - Architek",
    )
    assert page_mentions_org_name(
        "Canadian Council for Refugees protects refugee rights",
        org_raw_name="Canadian Council for Refugees - Conseil canadien pour les réfugiés",
        site_title="Home | Canadian Council for Refugees",
    )


@patch("utils.website_verify.verify_website_live", return_value=True)
def test_confirm_website_known_host_soft_passes_missing_name_tokens(mock_live):
    """Known employer URL must not fail solely on name-token mismatch (BPAC-style)."""
    assert (
        confirm_website(
            "https://www.burlingtonpac.ca",
            evidence_urls=[],
            known_website="https://www.burlingtonpac.ca",
            site_title="Home",
            site_text="Welcome to our performing arts venue. Buy tickets today.",
            org_raw_name="The Burlington Performing Arts Centre",
            province="ON",
            municipality="Burlington",
        )
        == "https://www.burlingtonpac.ca"
    )
    mock_live.assert_called_once()


@patch("utils.website_verify.verify_website_live", return_value=True)
def test_confirm_website_accepts_when_numbered_tokens_present(mock_live):
    evidence = ["https://example-orford.ca/"]
    assert (
        confirm_website(
            "https://example-orford.ca",
            evidence_urls=evidence,
            site_text="9076-5215 Québec Inc. / Rembourrage Orford Magog",
            org_raw_name="9076-5215 QUÉBEC Inc.",
        )
        == "https://example-orford.ca"
    )
