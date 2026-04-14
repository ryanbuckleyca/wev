"""Tests for BaseScraper SSE-related behavior."""

from unittest.mock import patch

import pytest

from scrapers.base import BaseScraper
from tests.conftest import make_source


class SimpleScraper(BaseScraper):
    listing_selector = ".item"
    job_wait_selector = "h1"
    SELECTORS = {
        "job_title": "h1",
        "description": ".desc",
        "organization": ".org",
        "wage": ".wage",
    }


@pytest.fixture
def scraper():
    return SimpleScraper(make_source())


@patch("scrapers.base.is_recent_job", return_value=True)
def test_extract_job_fields_does_not_classify_inline(mock_recent, scraper, page):
    """SSE classification should NOT happen inline — it's deferred to the post-processor."""
    page.set_content("""
        <h1>Dev</h1>
        <div class="desc">Description of the job</div>
        <div class="org">Acme</div>
        <div class="wage">$100k</div>
    """)

    scraper.extract_job_fields(page, {}, index=0)

    assert len(scraper.jobs) == 1
    job = scraper.jobs[0]
    assert job["job_title"] == "Dev"
    # No SSE fields should be set inline
    assert job.get("sse_rating") is None
    assert job.get("is_sse") is None
