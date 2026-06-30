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


def test_builds_full_url_from_relative_data_ref(scraper):
    item = make_item(data_ref="/jobs/123")
    assert scraper.get_job_url(item) == "https://example.com/jobs/123"


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


# --- selectors ---


def test_job_title_selector():
    assert WorkInCultureScraper.SELECTORS["job_title"] == ".wp-block-post-title"


def test_date_posted_selector():
    assert WorkInCultureScraper.SELECTORS["date_posted"] == (
        ".job-listing-meta .date-posted time", ("attr", "datetime")
    )


def test_listing_selector():
    assert WorkInCultureScraper.listing_selector == "ol.ais-Hits-list article"


def test_job_wait_selector():
    assert WorkInCultureScraper.job_wait_selector == "div.single_job_listing"


# --- extraction against real HTML ---


def test_extract_job_title(page):
    page.set_content("<h1 class='wp-block-post-title'>Software Developer</h1>")
    scraper = WorkInCultureScraper(make_source())
    result = scraper.extract_with_selectors(page, {"job_title": ".wp-block-post-title"})
    assert result["job_title"] == "Software Developer"


def test_extract_description(page):
    page.set_content("<div id='job-listing-description'><p>Great job here.</p></div>")
    scraper = WorkInCultureScraper(make_source())
    result = scraper.extract_with_selectors(page, {"description": "#job-listing-description"})
    assert "Great job here." in result["description"]
