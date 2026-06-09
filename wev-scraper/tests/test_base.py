"""Tests for BaseScraper utility methods using minimal inline HTML."""

from unittest.mock import MagicMock, patch

import pytest
from playwright.sync_api import Locator

from conftest import make_source
from scrapers.base import BaseScraper, _block_heavy_resources, _get_stealth, _is_ci


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


class ForceHeadedStubScraper(BaseScraper):
    force_headed = True


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
    assert isinstance(items, Locator)
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
            assert self.page is not None
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


def test_resolve_headless_scraper_can_force_headed(monkeypatch):
    monkeypatch.delenv("SCRAPER_HEADED", raising=False)
    scraper = ForceHeadedStubScraper(make_source())
    assert scraper._resolve_headless(True) is False


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


# --- _retry ---

def test_retry_success():
    scraper = BaseScraper(make_source())
    mock_func = MagicMock(return_value="ok")
    assert scraper._retry(mock_func) == "ok"
    assert mock_func.call_count == 1


def test_retry_fails_then_success():
    scraper = BaseScraper(make_source())
    mock_func = MagicMock(side_effect=[Exception("fail"), "ok"])
    assert scraper._retry(mock_func) == "ok"
    assert mock_func.call_count == 2


def test_retry_bails_on_403_non_ci(monkeypatch):
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    scraper = BaseScraper(make_source())
    mock_func = MagicMock(side_effect=Exception("403 Forbidden"))
    with pytest.raises(Exception, match="403 Forbidden"):
        scraper._retry(mock_func)
    assert mock_func.call_count == 1


# --- _is_error_page ---

def test_is_error_page_403(page):
    page.set_content("<html><head><title>403 Forbidden</title></head><body></body></html>")
    scraper = BaseScraper(make_source())
    with pytest.raises(Exception, match="403 Forbidden"):
        scraper._is_error_page(page)


def test_is_error_page_404(page):
    page.set_content("<html><head><title>404 Not Found</title></head><body></body></html>")
    scraper = BaseScraper(make_source())
    with pytest.raises(Exception, match="404 Not Found"):
        scraper._is_error_page(page)


def test_is_error_page_cloudflare(page):
    page.set_content('<html><body><div class="cf-challenge"></div></body></html>')
    scraper = BaseScraper(make_source())
    with pytest.raises(Exception, match="Bot challenge detected"):
        scraper._is_error_page(page)


def test_is_error_page_does_not_pause_without_vpn(page, monkeypatch):
    monkeypatch.delenv("SCRAPER_VPN_MODE", raising=False)
    page.set_content('<html><body><div class="cf-challenge"></div></body></html>')
    scraper = BaseScraper(make_source(name="Manual Test Source"))
    scraper._resolved_headless = False

    with patch("sys.stdin.isatty", return_value=True), patch("builtins.input") as mock_input:
        with pytest.raises(Exception, match="Bot challenge detected"):
            scraper._is_error_page(page)

    mock_input.assert_not_called()


def test_is_error_page_allows_manual_challenge_resume_in_vpn_mode(page, monkeypatch):
    monkeypatch.setenv("SCRAPER_VPN_MODE", "1")
    page.goto("data:text/html,<html></html>")
    page.set_content('<html><body><div class="cf-challenge"></div></body></html>')
    scraper = BaseScraper(make_source(name="Manual Test Source"))
    scraper._resolved_headless = False

    def complete_challenge(_prompt):
        page.set_content("<html><head><title>Jobs</title></head><body>Listings ready</body></html>")
        return ""

    with patch("sys.stdin.isatty", return_value=True), patch("builtins.input", side_effect=complete_challenge):
        scraper._is_error_page(page)


def test_restore_page_scrollability_best_effort():
    page = MagicMock()

    BaseScraper._restore_page_scrollability(page)

    page.add_style_tag.assert_called_once()
    page.evaluate.assert_called_once()


# --- extract_job_fields ---

@patch("scrapers.base.is_recent_job", return_value=False)
def test_extract_job_fields_stops_chronological(mock_recent, page):
    scraper = StubScraper(make_source())
    scraper.is_chronological = True
    page.set_content(JOB_PAGE_HTML)

    scraper.extract_job_fields(page, {"date_posted": "2020-01-01"}, index=0)

    assert scraper.should_quit_list is True
    assert len(scraper.jobs) == 0


# --- _process_listing_items ---

def test_process_listing_items_skips_duplicates(page):
    scraper = StubScraper(make_source())
    scraper.existing_urls = {"https://example.com/job/1"}
    scraper.listings_page = page
    scraper.page = page

    page.set_content('<a class="item" href="https://example.com/job/1">Job</a>')
    items = page.locator(".item")
    scraper._process_listing_items(items)

    assert scraper.skipped_duplicates == 1
    assert len(scraper.jobs) == 0


def test_process_listing_items_reaches_max_jobs(page):
    scraper = StubScraper(make_source())
    scraper._max_jobs = 1
    scraper.listings_page = page
    scraper.page = page
    scraper.jobs = [{"id": "prev-job"}]

    page.set_content('<a class="item" href="https://example.com/job/2">Job</a>')
    items = page.locator(".item")
    scraper._process_listing_items(items)

    assert scraper.should_quit_list is True
    assert len(scraper.jobs) == 1


# --- Utilities & Browser Lifecycle ---

@pytest.fixture
def reset_stealth():
    """Fixture to reset the stealth instance and restore it after test."""
    import scrapers.base
    original = scrapers.base._stealth_instance
    scrapers.base._stealth_instance = None
    yield
    scrapers.base._stealth_instance = original


def test_is_ci(monkeypatch):
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    assert _is_ci() is True
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    assert _is_ci() is False


def test_get_stealth(reset_stealth):
    # Test lazy init and caching
    with patch("playwright_stealth.Stealth") as mock_stealth_class:
        _get_stealth()
        assert mock_stealth_class.call_count == 1
        _get_stealth()
        assert mock_stealth_class.call_count == 1


def test_build_context_headers_real_chrome_uses_browser_defaults():
    scraper = BaseScraper(make_source())
    headers, user_agent = scraper._build_context_headers(use_real_chrome=True)

    assert user_agent is None
    assert "Sec-CH-UA" not in headers
    assert headers["Accept-Language"] == "en-CA,en-US;q=0.9,en;q=0.8"


def test_build_context_headers_chromium_spoofs_fingerprint():
    scraper = BaseScraper(make_source())
    headers, user_agent = scraper._build_context_headers(use_real_chrome=False)

    assert user_agent is not None
    assert headers["Sec-CH-UA"] == '"Google Chrome";v="149", "Chromium";v="149", "Not_A Brand";v="24"'
    assert headers["Sec-CH-UA-Mobile"] == "?0"


@patch("playwright.sync_api.sync_playwright")
def test_start_browser(mock_sync_pw):
    scraper = BaseScraper(make_source())
    mock_pw = mock_sync_pw.return_value.start.return_value
    mock_browser = mock_pw.chromium.launch.return_value
    mock_context = mock_browser.new_context.return_value
    mock_page = mock_context.new_page.return_value

    page = scraper.start_browser(headless=True)

    assert page == mock_page
    assert scraper.playwright == mock_pw
    assert scraper.browser == mock_browser
    assert scraper.context == mock_context


def test_close_browser():
    scraper = BaseScraper(make_source())
    mock_playwright = MagicMock()
    mock_browser = MagicMock()
    mock_context = MagicMock()
    scraper.playwright = mock_playwright
    scraper.browser = mock_browser
    scraper.context = mock_context

    scraper.close_browser()

    mock_context.close.assert_called_once()
    mock_browser.close.assert_called_once()
    mock_playwright.stop.assert_called_once()
    assert scraper.context is None
    assert scraper.browser is None
    assert scraper.playwright is None

    scraper.close_browser()

    mock_context.close.assert_called_once()
    mock_browser.close.assert_called_once()
    mock_playwright.stop.assert_called_once()


def test_close_browser_failure_handling():
    """Ensure all resources are attempted to be closed even if one fails."""
    scraper = BaseScraper(make_source())
    mock_playwright = MagicMock()
    mock_browser = MagicMock()
    mock_context = MagicMock()

    # Simulate failures
    mock_context.close.side_effect = Exception("context-close-failed")
    mock_browser.close.side_effect = Exception("browser-close-failed")

    scraper.playwright = mock_playwright
    scraper.browser = mock_browser
    scraper.context = mock_context

    # Should raise the first error encountered
    with pytest.raises(Exception, match="context-close-failed"):
        scraper.close_browser()

    # All resources should still have been attempted
    mock_context.close.assert_called_once()
    mock_browser.close.assert_called_once()
    mock_playwright.stop.assert_called_once()

    # Attributes for failed closes should still be intact
    assert scraper.context is not None
    assert scraper.browser is not None
    # Attribute for successful close should be None
    assert scraper.playwright is None


def test_block_heavy_resources():
    mock_context = MagicMock()
    _block_heavy_resources(mock_context)
    mock_context.route.assert_called_once()
