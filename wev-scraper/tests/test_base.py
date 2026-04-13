"""Tests for BaseScraper utility methods using minimal inline HTML."""

from unittest.mock import patch

from scrapers.base import BaseScraper
from tests.conftest import make_source


class StubScraper(BaseScraper):
    listing_selector = ".item"
    job_wait_selector = ".detail"
    SELECTORS = {
        "job_title": "h1",
        "description": (".content", "html"),
        "wage": ".pay",
    }


class StubWithCustomExtract(BaseScraper):
    SELECTORS = {"job_title": "h1"}

    def extract_job_title(self, page, listing_data):
        return "custom-title"


# --- extract_with_selectors ---


def test_text_selector(page):
    page.set_content('<div><h1>My Title</h1></div>')
    scraper = StubScraper(make_source())
    result = scraper.extract_with_selectors(page, {"job_title": "h1"})
    assert result["job_title"] == "My Title"


def test_html_selector(page):
    page.set_content('<div class="content"><p>Hello <b>World</b></p></div>')
    scraper = StubScraper(make_source())
    result = scraper.extract_with_selectors(page, {"desc": (".content", "html")})
    assert "<b>World</b>" in result["desc"]


def test_attr_selector(page):
    page.set_content('<a id="link" href="https://example.com">Click</a>')
    scraper = StubScraper(make_source())
    result = scraper.extract_with_selectors(page, {"url": ("#link", ("attr", "href"))})
    assert result["url"] == "https://example.com"


def test_strip_prefix_selector(page):
    page.set_content('<span class="date">Posted on February 15, 2026</span>')
    scraper = StubScraper(make_source())
    result = scraper.extract_with_selectors(page, {
        "date_posted": (".date", "text", "Posted on")
    })
    assert result["date_posted"] == "February 15, 2026"


def test_strip_prefix_with_html(page):
    """Strip prefix should be ignored for html extraction method."""
    page.set_content('<div class="d"><p>Hello</p></div>')
    scraper = StubScraper(make_source())
    result = scraper.extract_with_selectors(page, {
        "desc": (".d", "html", "ignored")
    })
    assert "<p>Hello</p>" in result["desc"]


def test_missing_selector_returns_none(page):
    page.set_content('<div>nothing here</div>')
    scraper = StubScraper(make_source())
    result = scraper.extract_with_selectors(page, {"wage": ".nonexistent"})
    assert result["wage"] is None


# --- _get_field ---


def test_get_field_uses_selector(page):
    page.set_content('<div><h1>Selector Title</h1></div>')
    scraper = StubScraper(make_source())
    result = scraper._get_field("job_title", page, {})
    assert result == "Selector Title"


def test_get_field_custom_method_beats_selector(page):
    page.set_content('<div><h1>Selector Title</h1></div>')
    scraper = StubWithCustomExtract(make_source())
    result = scraper._get_field("job_title", page, {})
    assert result == "custom-title"


def test_get_field_returns_none_for_unknown(page):
    page.set_content('<div>nothing</div>')
    scraper = StubScraper(make_source())
    result = scraper._get_field("close_date", page, {})
    assert result is None


# --- get_listing_items ---


def test_get_listing_items(page):
    page.set_content("""
        <div>
            <div class="item"><a href="/job/1">Job 1</a></div>
            <div class="item"><a href="/job/2">Job 2</a></div>
        </div>
    """)
    scraper = StubScraper(make_source())
    items = scraper.get_listing_items(page)
    assert items.count() == 2


# --- get_job_url ---


def test_get_job_url_absolute(page):
    page.set_content('<div class="item"><a href="https://example.com/job/1">Job</a></div>')
    scraper = StubScraper(make_source())
    item = page.locator(".item").first
    url = scraper.get_job_url(item)
    assert url == "https://example.com/job/1"


def test_get_job_url_relative(page):
    page.set_content('<div class="item"><a href="/job/1">Job</a></div>')
    scraper = StubScraper(make_source(url="https://example.com/jobs"))
    scraper.listings_page = page
    item = page.locator(".item").first
    url = scraper.get_job_url(item)
    assert url is not None
    assert "/job/1" in url


# --- build_full_url ---


def test_build_full_url():
    scraper = StubScraper(make_source(url="https://example.com/jobs"))
    result = scraper.build_full_url("/job/123")
    assert result == "https://example.com/job/123"


# --- listing_url preservation (unique URL must survive into final job dict) ---


JOB_PAGE_HTML = """
<div>
    <h1>Test Job</h1>
    <div class="content"><p>Description</p></div>
    <span class="org">Acme Corp</span>
    <span class="date">March 1, 2026</span>
</div>
"""


class StubScraperWithOrg(BaseScraper):
    listing_selector = ".item"
    job_wait_selector = "h1"
    SELECTORS = {
        "job_title": "h1",
        "description": (".content", "html"),
        "organization": ".org",
        "date_posted": ".date",
    }


@patch("scrapers.base.is_recent_job", return_value=True)
def test_listing_url_uses_unique_url_not_page_url(mock_recent, page):
    """The job's listing_url must come from listing_data (the unique URL from
    get_job_url), not from job_page.url which may be a generic board URL."""
    page.set_content(JOB_PAGE_HTML)
    scraper = StubScraperWithOrg(make_source())

    unique_url = "https://example.com/jobs/unique-abc-123"
    listing_data = {"listing_url": unique_url}

    scraper.extract_job_fields(page, listing_data, index=0)

    assert len(scraper.jobs) == 1
    assert scraper.jobs[0]["listing_url"] == unique_url
    assert scraper.jobs[0]["listing_url"] != page.url


@patch("scrapers.base.is_recent_job", return_value=True)
def test_listing_url_falls_back_to_page_url_when_not_in_listing_data(mock_recent, page):
    """When listing_data has no listing_url, fall back to the page URL."""
    page.set_content(JOB_PAGE_HTML)
    scraper = StubScraperWithOrg(make_source())

    scraper.extract_job_fields(page, {}, index=0)

    assert len(scraper.jobs) == 1
    assert scraper.jobs[0]["listing_url"] == page.url


@patch("scrapers.base.is_recent_job", return_value=True)
def test_process_listing_items_passes_unique_url_to_extract(mock_recent, page):
    """_process_listing_items must set listing_data['listing_url'] to the URL
    returned by get_job_url, so extract_job_fields gets the unique URL."""

    class InlinePageScraper(StubScraperWithOrg):
        """Scraper that returns a unique URL from get_job_url but whose job
        page resolves to a different (generic) URL."""
        def get_job_url(self, item):
            return "https://board.example.com/jobs?id=42"

        def safe_open_job_page(self, job_url, wait_selector=None, timeout=10000):
            # Simulate: the page loads but its URL is the generic board URL
            self.page.set_content(JOB_PAGE_HTML)
            return (self.page, True)

    page.set_content("""
        <div>
            <div class="item"><a href="https://board.example.com/jobs?id=42">Job</a></div>
        </div>
    """)
    scraper = InlinePageScraper(make_source(url="https://board.example.com/jobs"))
    scraper.listings_page = page
    scraper.page = page

    items = scraper.get_listing_items(page)
    scraper._process_listing_items(items)

    assert len(scraper.jobs) == 1
    assert scraper.jobs[0]["listing_url"] == "https://board.example.com/jobs?id=42"
    # Crucially, NOT the generic board URL
    assert scraper.jobs[0]["listing_url"] != "https://board.example.com/jobs"


# --- _parse_int_env ---


def test_parse_int_env_valid(monkeypatch):
    monkeypatch.setenv("MAX_JOBS_PER_SOURCE", "10")
    scraper = StubScraper(make_source())
    assert scraper._max_jobs == 10


def test_parse_int_env_empty(monkeypatch):
    monkeypatch.delenv("MAX_JOBS_PER_SOURCE", raising=False)
    scraper = StubScraper(make_source())
    assert scraper._max_jobs is None


def test_parse_int_env_invalid(monkeypatch):
    monkeypatch.setenv("MAX_JOBS_PER_SOURCE", "not-a-number")
    scraper = StubScraper(make_source())
    assert scraper._max_jobs is None


def test_parse_int_env_whitespace(monkeypatch):
    monkeypatch.setenv("MAX_JOBS_PER_SOURCE", "  ")
    scraper = StubScraper(make_source())
    assert scraper._max_jobs is None


def test_parse_int_env_zero(monkeypatch):
    monkeypatch.setenv("MAX_JOBS_PER_SOURCE", "0")
    scraper = StubScraper(make_source())
    assert scraper._max_jobs == 0


def test_max_jobs_per_page_resolved_at_init(monkeypatch):
    monkeypatch.setenv("MAX_JOBS_PER_PAGE", "5")
    scraper = StubScraper(make_source())
    assert scraper._max_jobs_per_page == 5


# --- _resolve_headless ---


def test_resolve_headless_default_passes_through(monkeypatch):
    monkeypatch.delenv("SCRAPER_HEADED", raising=False)
    scraper = StubScraper(make_source())
    assert scraper._resolve_headless(True) is True
    assert scraper._resolve_headless(False) is False


def test_resolve_headless_env_forces_headed(monkeypatch):
    monkeypatch.setenv("SCRAPER_HEADED", "1")
    scraper = StubScraper(make_source())
    assert scraper._resolve_headless(True) is False


def test_resolve_headless_env_other_value_does_not_force(monkeypatch):
    monkeypatch.setenv("SCRAPER_HEADED", "0")
    scraper = StubScraper(make_source())
    assert scraper._resolve_headless(True) is True


# --- get_job_url board-URL guard ---


def test_get_job_url_rejects_board_url(page):
    """A card that links back to the source board URL should return None."""
    source_url = "https://example.com/jobs"
    page.set_content(f'<div class="item"><a href="{source_url}">Board</a></div>')
    scraper = StubScraper(make_source(url=source_url))
    item = page.locator(".item").first
    assert scraper.get_job_url(item) is None


def test_get_job_url_rejects_board_url_with_trailing_slash(page):
    """Trailing slash variants of the board URL should also be rejected."""
    source_url = "https://example.com/jobs"
    page.set_content('<div class="item"><a href="https://example.com/jobs/">Board</a></div>')
    scraper = StubScraper(make_source(url=source_url))
    item = page.locator(".item").first
    assert scraper.get_job_url(item) is None


def test_get_job_url_allows_job_subpath(page):
    """A URL that starts with the board URL but has a subpath is a valid job URL."""
    source_url = "https://example.com/jobs"
    page.set_content('<div class="item"><a href="https://example.com/jobs/123">Job</a></div>')
    scraper = StubScraper(make_source(url=source_url))
    item = page.locator(".item").first
    assert scraper.get_job_url(item) == "https://example.com/jobs/123"
