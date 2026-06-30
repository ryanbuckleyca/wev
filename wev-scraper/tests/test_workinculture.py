"""Tests for WorkInCultureScraper."""

from unittest.mock import MagicMock

import pytest

from conftest import make_source
from scrapers.workinculture import WorkInCultureScraper


def make_item(data_ref=None, href=None, anchor_href=None):
    """Create a mock Playwright locator for a listing card."""
    item = MagicMock()
    item.get_attribute.side_effect = lambda attr: {
        "data-ref": data_ref,
        "href": href,
    }.get(attr)
    anchor = MagicMock()
    anchor.get_attribute.return_value = anchor_href if anchor_href is not None else href
    item.locator.return_value.first = anchor
    return item


@pytest.fixture
def scraper():
    return WorkInCultureScraper(make_source())


# --- get_job_url ---


def test_uses_data_ref_when_present(scraper):
    item = make_item(data_ref="https://workinculture.ca/jobs/123")
    assert scraper.get_job_url(item) == "https://workinculture.ca/jobs/123"


def test_builds_full_url_from_relative_data_ref():
    scraper = WorkInCultureScraper(make_source(url="https://workinculture.ca/job-search/"))
    item = make_item(data_ref="/jobs/123")
    assert scraper.get_job_url(item) == "https://workinculture.ca/jobs/123"


def test_falls_back_to_item_href_when_no_data_ref(scraper):
    item = make_item(href="https://workinculture.ca/jobs/456")
    assert scraper.get_job_url(item) == "https://workinculture.ca/jobs/456"


def test_falls_back_to_anchor_href_when_item_has_no_href(scraper):
    """When item.get_attribute('href') is None, fall through to the anchor tag."""
    item = make_item(href=None, anchor_href="https://workinculture.ca/jobs/789")
    assert scraper.get_job_url(item) == "https://workinculture.ca/jobs/789"


def test_rejects_listing_board_url(scraper):
    item = make_item(href="https://example.com/jobs")
    assert scraper.get_job_url(item) is None


def test_returns_none_when_no_url_found(scraper):
    item = make_item()
    assert scraper.get_job_url(item) is None


def test_falls_back_when_data_ref_raises(scraper):
    item = MagicMock()

    def get_attr(attr):
        if attr == "data-ref":
            raise Exception("boom")
        return None

    item.get_attribute.side_effect = get_attr
    anchor = MagicMock()
    anchor.get_attribute.return_value = "https://workinculture.ca/jobs/999"
    item.locator.return_value.first = anchor
    assert scraper.get_job_url(item) == "https://workinculture.ca/jobs/999"


# --- extraction against real HTML ---


def test_extract_job_title(page):
    page.set_content("<h1 class='wp-block-post-title'>Software Developer</h1>")
    scraper = WorkInCultureScraper(make_source())
    result = scraper.extract_with_selectors(page, {"job_title": scraper.SELECTORS["job_title"]})
    assert result["job_title"] == "Software Developer"


def test_extract_description(page):
    page.set_content("<div id='job-listing-description'><p>Great job here.</p></div>")
    scraper = WorkInCultureScraper(make_source())
    result = scraper.extract_with_selectors(page, {"description": scraper.SELECTORS["description"]})
    assert result["description"] == "Great job here."


def test_extract_close_date(page):
    page.set_content(
        '<div class="job-listing-meta">'
        '<span class="job-deadline">2026-07-15</span>'
        "</div>"
    )
    scraper = WorkInCultureScraper(make_source())
    result = scraper.extract_with_selectors(page, {"close_date": scraper.SELECTORS["close_date"]})
    assert result["close_date"] == "2026-07-15"


# --- pagination ---


class StubAlgoliaPage:
    """Minimal page stub for has_next_page tests (no real Playwright)."""

    def __init__(self, infinite_enabled=False, pagination_next=False):
        self._infinite_enabled = infinite_enabled
        self._pagination_next = pagination_next
        self._selectors = {}
        if infinite_enabled:
            self._selectors[".ais-InfiniteHits-loadMore"] = True
        if pagination_next:
            self._selectors[".ais-Pagination-item--next:not(.ais-Pagination-item--disabled)"] = True

    def locator(self, selector):
        class StubLocator:
            def __init__(self, parent, selector):
                self._parent = parent
                self._selector = selector

            @property
            def first(self):
                return self

            def count(self):
                return 1 if self._selector in self._parent._selectors else 0

            def is_enabled(self, **kwargs):
                return self._parent._infinite_enabled

        return StubLocator(self, selector)


def test_has_next_page_with_infinite_hits(scraper):
    page = StubAlgoliaPage(infinite_enabled=True)
    assert scraper.has_next_page(page) is True


def test_has_next_page_with_pagination(scraper):
    page = StubAlgoliaPage(pagination_next=True)
    assert scraper.has_next_page(page) is True


def test_has_next_page_returns_false_when_no_more(scraper):
    page = StubAlgoliaPage()
    assert scraper.has_next_page(page) is False
