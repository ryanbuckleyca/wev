import socket
import urllib.error

import pytest

from scrapers import charityvillage as charityvillage_module
from scrapers.charityvillage import (
    CharityVillageScraper,
    _extract_bounded_pdf_text,
    _is_safe_pdf_url,
    _normalize_pdf_url,
    _read_pdf_response,
)


def make_source():
    return {"id": "test", "url": "https://www.charityvillage.com", "name": "CharityVillage"}


def test_get_listings_url():
    scraper = CharityVillageScraper(make_source())
    assert scraper.get_listings_url() == "https://www.charityvillage.com/jobs"


def test_extract_job_title(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div data-testid="title">Senior Developer</div>')
    title = scraper.extract_job_title(page, {})
    assert title == "Senior Developer"


def test_extract_job_title_falls_back_to_listing_data(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div>no title selector here</div>')
    title = scraper.extract_job_title(page, {"job_title": "Fallback Title"})
    assert title == "Fallback Title"


def test_extract_job_title_defaults_to_unknown(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div>no title selector here</div>')
    title = scraper.extract_job_title(page, {})
    assert title == "Unknown"


def test_extract_organization(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div data-testid="company-name">Charity Corp</div>')
    org = scraper.extract_organization(page, {})
    assert org == "Charity Corp"


def test_extract_organization_returns_none_when_missing(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div>no company here</div>')
    org = scraper.extract_organization(page, {})
    assert org is None


def test_extract_description(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div data-testid="job-detail-description"><p>Great job</p></div>')
    desc = scraper.extract_description(page, {})
    assert desc == "Great job"


def test_pdf_url_normalization_rejects_unsafe_inputs():
    base_url = "https://www.charityvillage.com/jobs/example"

    assert _normalize_pdf_url("/files/job.pdf#toolbar=0", base_url) == (
        "https://www.charityvillage.com/files/job.pdf"
    )
    assert _normalize_pdf_url("javascript:alert(1)", base_url) is None
    assert _normalize_pdf_url("data:application/pdf;base64,AAAA", base_url) is None
    assert _normalize_pdf_url("https://example.com:8443/job.pdf", base_url) is None
    assert _normalize_pdf_url("https://user:pass@example.com/job.pdf", base_url) is None


def test_pdf_url_safety_rejects_private_dns_results(monkeypatch):
    def fake_getaddrinfo(host, port, type=socket.SOCK_STREAM):
        assert host == "jobs.charityvillage.com"
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.8", port))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)

    assert _is_safe_pdf_url("https://jobs.charityvillage.com/job.pdf") is False


def test_pdf_url_safety_allows_public_dns_results(monkeypatch):
    def fake_getaddrinfo(host, port, type=socket.SOCK_STREAM):
        assert host == "jobs.charityvillage.com"
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", port))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)

    assert _is_safe_pdf_url("https://jobs.charityvillage.com/job.pdf") is True


def test_pdf_url_safety_rejects_mixed_public_private_dns_results(monkeypatch):
    def fake_getaddrinfo(host, port, type=socket.SOCK_STREAM):
        assert host == "jobs.charityvillage.com"
        return [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", port)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.8", port)),
        ]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)

    assert _is_safe_pdf_url("https://jobs.charityvillage.com/job.pdf") is False


def test_pdf_url_safety_rejects_host_outside_allowlist(monkeypatch):
    called = {"dns": False}

    def fake_getaddrinfo(host, port, type=socket.SOCK_STREAM):
        called["dns"] = True
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", port))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)

    assert _is_safe_pdf_url("https://evil.example.org/job.pdf") is False
    assert called["dns"] is False


class FakePdfResponse:
    def __init__(self, body: bytes, headers: dict[str, str]):
        self.headers = headers
        self._body = body
        self._offset = 0

    def read(self, size: int) -> bytes:
        if self._offset >= len(self._body):
            return b""
        chunk = self._body[self._offset:self._offset + size]
        self._offset += len(chunk)
        return chunk


def test_read_pdf_response_validates_content_type_and_magic_bytes():
    assert _read_pdf_response(
        FakePdfResponse(b"%PDF-1.7\nbody", {"Content-Type": "application/pdf"})
    ) == b"%PDF-1.7\nbody"
    assert _read_pdf_response(FakePdfResponse(b"%PDF", {})) is None
    assert _read_pdf_response(
        FakePdfResponse(b"<html></html>", {"Content-Type": "application/pdf"})
    ) is None
    assert _read_pdf_response(
        FakePdfResponse(b"%PDF", {"Content-Type": "text/html"})
    ) is None


def test_read_pdf_response_enforces_byte_limit(monkeypatch):
    monkeypatch.setattr(charityvillage_module, "_PDF_MAX_BYTES", 8)

    assert _read_pdf_response(
        FakePdfResponse(
            b"%PDF",
            {"Content-Type": "application/pdf", "Content-Length": "9"},
        )
    ) is None
    assert _read_pdf_response(
        FakePdfResponse(
            b"%PDF-1.7\nmore bytes",
            {"Content-Type": "application/pdf"},
        )
    ) is None


class FakePdfPage:
    def __init__(self, text: str):
        self.text = text

    def extract_text(self):
        return self.text


class FakePdfReader:
    def __init__(self, pages):
        self.pages = pages


def test_extract_bounded_pdf_text_caps_output(monkeypatch):
    monkeypatch.setattr(charityvillage_module, "_PDF_MAX_CHARS", 10)
    monkeypatch.setattr(charityvillage_module, "_PDF_MAX_PAGES", 10)

    text = _extract_bounded_pdf_text(FakePdfReader([FakePdfPage("abcdefghijk")]))

    assert text == "abcdefghij\n\n[truncated: description exceeded PDF extraction limits]"


def test_extract_bounded_pdf_text_caps_page_count(monkeypatch):
    monkeypatch.setattr(charityvillage_module, "_PDF_MAX_CHARS", 100)
    monkeypatch.setattr(charityvillage_module, "_PDF_MAX_PAGES", 1)

    text = _extract_bounded_pdf_text(
        FakePdfReader([FakePdfPage("first"), FakePdfPage("second")])
    )

    assert text == "first\n\n[truncated: description exceeded PDF extraction limits]"


def test_no_redirect_opener_blocks_redirects():
    opener = charityvillage_module._build_no_redirect_opener()
    handler = next(h for h in opener.handlers if h.__class__.__name__ == "NoRedirectHandler")

    with pytest.raises(urllib.error.HTTPError):
        handler.redirect_request(
            req=type("Req", (), {"full_url": "https://jobs.example.org/job.pdf"})(),
            fp=None,
            code=302,
            msg="Found",
            headers={},
            newurl="https://169.254.169.254/latest/meta-data/",
        )


def test_extract_location_from_listing_data(page):
    scraper = CharityVillageScraper(make_source())
    loc = scraper.extract_location(page, {"teaser_location": "Toronto, ON"})
    assert loc == "Toronto, ON"


def test_extract_location_returns_none_when_missing(page):
    scraper = CharityVillageScraper(make_source())
    loc = scraper.extract_location(page, {})
    assert loc is None


def test_extract_wage(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div data-testid="fields-values">Fundraising | Full Time | $80,000 - $90,000 per year</div>')
    wage = scraper.extract_wage(page, {})
    assert wage == "$80,000 - $90,000"


def test_extract_wage_returns_none_when_no_salary(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div data-testid="fields-values">Volunteer | No wage info</div>')
    wage = scraper.extract_wage(page, {})
    assert wage is None


def test_extract_wage_returns_none_when_missing(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div>no fields here</div>')
    wage = scraper.extract_wage(page, {})
    assert wage is None


def test_extract_employment_type(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div data-testid="fields-values">Fundraising | Full Time | $80,000 - $90,000 per year</div>')
    emp = scraper.extract_employment_type(page, {})
    assert emp == "Full Time"


def test_extract_employment_type_single_value(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div data-testid="fields-values">Volunteer</div>')
    emp = scraper.extract_employment_type(page, {})
    assert emp == "Volunteer"


def test_extract_employment_type_case_insensitive(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div data-testid="fields-values">FULL-TIME | CONTRACT</div>')
    emp = scraper.extract_employment_type(page, {})
    assert emp == "FULL-TIME"


def test_extract_employment_type_returns_none_when_no_match(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div data-testid="fields-values">Fundraising | Category</div>')
    emp = scraper.extract_employment_type(page, {})
    assert emp is None


def test_extract_employment_type_returns_none_when_missing(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div>no fields here</div>')
    emp = scraper.extract_employment_type(page, {})
    assert emp is None


def test_extract_date_posted(page):
    scraper = CharityVillageScraper(make_source())
    date = scraper.extract_date_posted(page, {"date_posted": "2024-01-15"})
    assert date == "2024-01-15"


def test_extract_close_date(page):
    scraper = CharityVillageScraper(make_source())
    date = scraper.extract_close_date(page, {"close_date": "2024-02-15"})
    assert date == "2024-02-15"


def test_get_listing_data_with_location(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content("""
        <div>
            <div data-testid="jcl-job-teaser-wrapper">
                <div data-testid="jcl-job-teaser-location">Toronto, ON</div>
            </div>
        </div>
    """)
    item = page.locator("[data-testid='jcl-job-teaser-wrapper']")
    data = scraper.get_listing_data(item)
    assert data.get("teaser_location") == "Toronto, ON"


def test_get_listing_data_with_remote_status(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content("""
        <div data-testid="jcl-job-teaser-wrapper">
            Fully Remote position
        </div>
    """)
    item = page.locator("[data-testid='jcl-job-teaser-wrapper']")
    data = scraper.get_listing_data(item)
    assert data.get("remote_status") == "Fully Remote"


def test_get_listing_data_with_hybrid_remote_status(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content("""
        <div data-testid="jcl-job-teaser-wrapper">
            Hybrid - 3 days in office
        </div>
    """)
    item = page.locator("[data-testid='jcl-job-teaser-wrapper']")
    data = scraper.get_listing_data(item)
    assert data.get("remote_status") == "Hybrid"


def test_get_listing_data_with_dates(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content("""
        <div data-testid="jcl-job-teaser-wrapper">
            Published: 2024-01-15<br/>
            Expires: 2024-02-15
        </div>
    """)
    item = page.locator("[data-testid='jcl-job-teaser-wrapper']")
    data = scraper.get_listing_data(item)
    assert data.get("date_posted") == "2024-01-15"
    assert data.get("close_date") == "2024-02-15"


def test_get_listing_data_returns_empty_dict_when_no_match(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content("""
        <div data-testid="jcl-job-teaser-wrapper">
            Some random text without dates or location
        </div>
    """)
    item = page.locator("[data-testid='jcl-job-teaser-wrapper']")
    data = scraper.get_listing_data(item)
    assert data == {}
