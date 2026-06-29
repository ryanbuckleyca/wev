"""Tests for CWCFScraper — Canadian Worker Co-op Federation RSS feed scraper."""

from unittest.mock import patch

from scrapers.cwcf import CWCFScraper


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

CWCF_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
    xmlns:content="http://purl.org/rss/1.0/modules/content/"
    xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
    <title>Job Postings - Canadian Worker Co-op Federation</title>
    <link>https://canadianworker.coop</link>
    <item>
        <title>Executive Director &#124; California Center for Cooperative Development</title>
        <link>https://canadianworker.coop/executive-director-california-center/</link>
        <dc:creator><![CDATA[Kenzie Love]]></dc:creator>
        <pubDate>Thu, 30 Apr 2026 21:24:04 +0000</pubDate>
        <category><![CDATA[Job Postings]]></category>
        <description><![CDATA[<p>CCCD is looking for an Executive Director...</p>]]></description>
        <content:encoded><![CDATA[<p>Full description of the Executive Director role at CCCD.</p>]]></content:encoded>
    </item>
    <item>
        <title>Co-Executive Director (Co-ED)</title>
        <link>https://canadianworker.coop/co-executive-director-co-ed/</link>
        <dc:creator><![CDATA[Ven]]></dc:creator>
        <pubDate>Fri, 13 Mar 2026 14:43:18 +0000</pubDate>
        <category><![CDATA[CWCF News]]></category>
        <category><![CDATA[Job Postings]]></category>
        <description><![CDATA[<p>CWCF is hiring a Co-ED...</p>]]></description>
        <content:encoded><![CDATA[<h2>Canadian Worker Co-operative Federation</h2><p>Full details here.</p>]]></content:encoded>
    </item>
</channel>
</rss>"""


from conftest import mock_requests_response


def make_source():
    return {
        "id": "cwcf-test",
        "url": "https://canadianworker.coop/category/news-events/job-postings/feed/",
        "name": "Canadian Worker Co-op Federation",
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_parses_title_with_pipe_separator(monkeypatch):
    """Titles like 'Job | Org' should be split into job_title and organization."""
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    monkeypatch.setenv("WITHIN_WEEKS", "9999")
    scraper = CWCFScraper(make_source())

    with patch("scrapers.base_feed.requests.get", return_value=mock_requests_response(CWCF_RSS)):
        jobs = scraper.fetch_jobs()

    assert len(jobs) == 2
    # First entry has "Title | Org" pattern
    assert jobs[0]["job_title"] == "Executive Director"
    assert jobs[0]["organization"] == "California Center for Cooperative Development"


def test_title_without_separator_uses_source_name(monkeypatch):
    """Titles without a pipe should use the source name as organization."""
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    monkeypatch.setenv("WITHIN_WEEKS", "9999")
    scraper = CWCFScraper(make_source())

    with patch("scrapers.base_feed.requests.get", return_value=mock_requests_response(CWCF_RSS)):
        jobs = scraper.fetch_jobs()

    # Second entry has no pipe separator
    assert jobs[1]["job_title"] == "Co-Executive Director (Co-ED)"
    assert jobs[1]["organization"] == "Canadian Worker Co-op Federation"


def test_prefers_content_encoded(monkeypatch):
    """content:encoded should be used for description, not the summary."""
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    monkeypatch.setenv("WITHIN_WEEKS", "9999")
    scraper = CWCFScraper(make_source())

    with patch("scrapers.base_feed.requests.get", return_value=mock_requests_response(CWCF_RSS)):
        jobs = scraper.fetch_jobs()

    assert "Full description of the Executive Director" in jobs[0]["description"]


def test_listing_url_set(monkeypatch):
    """Each job should have a listing_url from the RSS entry link."""
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    monkeypatch.setenv("WITHIN_WEEKS", "9999")
    scraper = CWCFScraper(make_source())

    with patch("scrapers.base_feed.requests.get", return_value=mock_requests_response(CWCF_RSS)):
        jobs = scraper.fetch_jobs()

    assert "canadianworker.coop" in jobs[0]["listing_url"]
    assert "canadianworker.coop" in jobs[1]["listing_url"]


def test_date_parsed(monkeypatch):
    """Dates from the feed should be parsed into ISO format."""
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    monkeypatch.setenv("WITHIN_WEEKS", "9999")
    scraper = CWCFScraper(make_source())

    with patch("scrapers.base_feed.requests.get", return_value=mock_requests_response(CWCF_RSS)):
        jobs = scraper.fetch_jobs()

    # date_posted should be normalized to ISO (YYYY-MM-DD)
    assert jobs[0]["date_posted"] == "2026-04-30"
    assert jobs[1]["date_posted"] == "2026-03-13"


def test_is_chronological():
    """CWCF scraper should be marked as chronological."""
    scraper = CWCFScraper(make_source())
    assert scraper.is_chronological is True


def test_em_dash_separator(monkeypatch):
    """Titles with em-dash separators should also be split."""
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    monkeypatch.setenv("WITHIN_WEEKS", "9999")

    feed_with_dash = """<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0"
        xmlns:content="http://purl.org/rss/1.0/modules/content/">
    <channel>
        <title>Test</title>
        <item>
            <title>Program Manager \u2014 Some Cooperative</title>
            <link>https://canadianworker.coop/program-manager/</link>
            <pubDate>Mon, 23 Jun 2026 12:00:00 +0000</pubDate>
            <description>A role.</description>
            <content:encoded><![CDATA[<p>Details.</p>]]></content:encoded>
        </item>
    </channel>
    </rss>"""

    scraper = CWCFScraper(make_source())

    with patch("scrapers.base_feed.requests.get", return_value=mock_requests_response(feed_with_dash)):
        jobs = scraper.fetch_jobs()

    assert len(jobs) == 1
    assert jobs[0]["job_title"] == "Program Manager"
    assert jobs[0]["organization"] == "Some Cooperative"
