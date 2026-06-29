"""Tests for BaseFeedScraper — the RSS/Atom feed scraper base class."""

import os
from unittest.mock import patch

import pytest

from scrapers.base_feed import BaseFeedScraper


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SAMPLE_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
    xmlns:content="http://purl.org/rss/1.0/modules/content/"
    xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
        <title>Senior Developer</title>
        <link>https://example.com/jobs/senior-dev</link>
        <pubDate>Mon, 23 Jun 2026 12:00:00 +0000</pubDate>
        <description>Short summary of the job.</description>
        <content:encoded><![CDATA[<p>Full HTML description of the Senior Developer role.</p>]]></content:encoded>
    </item>
    <item>
        <title>Junior Designer</title>
        <link>https://example.com/jobs/junior-designer</link>
        <pubDate>Sun, 22 Jun 2026 10:00:00 +0000</pubDate>
        <description>Designer role summary.</description>
    </item>
</channel>
</rss>"""

SAMPLE_RSS_OLD_ENTRY = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
    <title>Test Feed</title>
    <item>
        <title>Ancient Job</title>
        <link>https://example.com/jobs/ancient</link>
        <pubDate>Mon, 01 Jan 2020 12:00:00 +0000</pubDate>
        <description>Very old posting.</description>
    </item>
</channel>
</rss>"""

SAMPLE_RSS_NO_LINK = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
    <title>Test Feed</title>
    <item>
        <title>No Link Job</title>
        <description>Missing link element.</description>
    </item>
</channel>
</rss>"""

MALFORMED_RSS = """<?xml version="1.0"?>
<rss><channel><title>Broken</title>
<item><title>Oops</link></item>
</channel></rss>"""


def make_source(url="https://example.com/feed/", name="Test Source"):
    return {"id": "test-id", "url": url, "name": name}


def _mock_response(content: str | bytes, status_code: int = 200):
    """Create a mock requests.Response."""
    class MockResponse:
        def __init__(self):
            self.status_code = status_code
            self.content = content.encode("utf-8") if isinstance(content, str) else content
            self.text = content if isinstance(content, str) else content.decode("utf-8")
        def raise_for_status(self):
            if self.status_code >= 400:
                from requests.exceptions import HTTPError
                raise HTTPError(f"{self.status_code} Error")
    return MockResponse()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_close_browser_is_noop():
    """close_browser() must exist and do nothing (orchestrator calls it)."""
    scraper = BaseFeedScraper(make_source())
    scraper.close_browser()  # should not raise


def test_fetch_jobs_parses_rss(monkeypatch):
    """Standard RSS 2.0 entries are parsed into job dicts."""
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    scraper = BaseFeedScraper(make_source())

    with patch("scrapers.base_feed.requests.get", return_value=_mock_response(SAMPLE_RSS)):
        jobs = scraper.fetch_jobs()

    assert len(jobs) == 2
    assert jobs[0]["job_title"] == "Senior Developer"
    assert jobs[1]["job_title"] == "Junior Designer"
    # content:encoded should be preferred over summary
    assert "Full HTML description" in jobs[0]["description"]
    assert jobs[0]["listing_url"] is not None


def test_content_encoded_preferred_over_summary(monkeypatch):
    """When content:encoded is present, it should be used instead of summary."""
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    scraper = BaseFeedScraper(make_source())

    with patch("scrapers.base_feed.requests.get", return_value=_mock_response(SAMPLE_RSS)):
        jobs = scraper.fetch_jobs()

    # First entry has content:encoded
    assert "Full HTML description" in jobs[0]["description"]
    # Second entry only has summary
    assert "Designer role summary" in jobs[1]["description"]


def test_skips_entries_without_link(monkeypatch):
    """Entries missing a <link> should be skipped."""
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    scraper = BaseFeedScraper(make_source())

    with patch("scrapers.base_feed.requests.get", return_value=_mock_response(SAMPLE_RSS_NO_LINK)):
        jobs = scraper.fetch_jobs()

    assert len(jobs) == 0


def test_skips_outdated_entries(monkeypatch):
    """Old entries should be filtered out by recency check."""
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    scraper = BaseFeedScraper(make_source())

    with patch("scrapers.base_feed.requests.get", return_value=_mock_response(SAMPLE_RSS_OLD_ENTRY)):
        jobs = scraper.fetch_jobs()

    assert len(jobs) == 0


def test_chronological_early_exit(monkeypatch):
    """Chronological scrapers stop after first non-recent entry."""
    monkeypatch.setenv("SHOULD_GEOCODE", "0")

    # Create a feed with a recent entry followed by an old one
    mixed_feed = """<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
    <channel>
        <title>Test</title>
        <item>
            <title>Recent Job</title>
            <link>https://example.com/jobs/recent</link>
            <pubDate>Mon, 23 Jun 2026 12:00:00 +0000</pubDate>
            <description>New posting.</description>
        </item>
        <item>
            <title>Old Job</title>
            <link>https://example.com/jobs/old</link>
            <pubDate>Mon, 01 Jan 2020 12:00:00 +0000</pubDate>
            <description>Very old.</description>
        </item>
        <item>
            <title>Should Not Reach</title>
            <link>https://example.com/jobs/unreachable</link>
            <pubDate>Mon, 22 Jun 2026 12:00:00 +0000</pubDate>
            <description>This entry should not be processed.</description>
        </item>
    </channel>
    </rss>"""

    scraper = BaseFeedScraper(make_source())
    scraper.is_chronological = True

    with patch("scrapers.base_feed.requests.get", return_value=_mock_response(mixed_feed)):
        jobs = scraper.fetch_jobs()

    # Only the recent job should be collected; the old one triggers early exit
    assert len(jobs) == 1
    assert jobs[0]["job_title"] == "Recent Job"


def test_dedup_existing_urls(monkeypatch):
    """Entries with URLs already in the database should be skipped."""
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    scraper = BaseFeedScraper(make_source())
    scraper.existing_urls = {"https://example.com/jobs/senior-dev"}

    with patch("scrapers.base_feed.requests.get", return_value=_mock_response(SAMPLE_RSS)):
        jobs = scraper.fetch_jobs()

    # Only the second entry should be collected
    assert len(jobs) == 1
    assert jobs[0]["job_title"] == "Junior Designer"
    assert scraper.skipped_duplicates == 1


def test_dedup_within_same_run(monkeypatch):
    """Duplicate URLs within a single feed should be deduplicated."""
    monkeypatch.setenv("SHOULD_GEOCODE", "0")

    dupe_feed = """<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
    <channel>
        <title>Test</title>
        <item>
            <title>Job A</title>
            <link>https://example.com/jobs/same</link>
            <pubDate>Mon, 23 Jun 2026 12:00:00 +0000</pubDate>
            <description>First appearance.</description>
        </item>
        <item>
            <title>Job A Duplicate</title>
            <link>https://example.com/jobs/same</link>
            <pubDate>Mon, 23 Jun 2026 12:00:00 +0000</pubDate>
            <description>Second appearance.</description>
        </item>
    </channel>
    </rss>"""

    scraper = BaseFeedScraper(make_source())

    with patch("scrapers.base_feed.requests.get", return_value=_mock_response(dupe_feed)):
        jobs = scraper.fetch_jobs()

    assert len(jobs) == 1


def test_max_jobs_limit(monkeypatch):
    """MAX_JOBS_PER_SOURCE should be respected."""
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    monkeypatch.setenv("MAX_JOBS_PER_SOURCE", "1")
    scraper = BaseFeedScraper(make_source())

    with patch("scrapers.base_feed.requests.get", return_value=_mock_response(SAMPLE_RSS)):
        jobs = scraper.fetch_jobs()

    assert len(jobs) == 1


def test_http_error_raises(monkeypatch):
    """HTTP errors should raise RuntimeError."""
    scraper = BaseFeedScraper(make_source())

    with patch("scrapers.base_feed.requests.get", return_value=_mock_response("Not Found", 404)):
        with pytest.raises(RuntimeError, match="Failed to fetch feed"):
            scraper.fetch_jobs()


def test_malformed_feed_with_no_entries_raises(monkeypatch):
    """A completely broken feed (no entries) should raise RuntimeError."""
    scraper = BaseFeedScraper(make_source())

    empty_broken = """This is not XML at all."""
    with patch("scrapers.base_feed.requests.get", return_value=_mock_response(empty_broken)):
        with pytest.raises(RuntimeError, match="Feed parse error"):
            scraper.fetch_jobs()
