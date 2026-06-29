import os
import urllib.parse
from typing import Any

import feedparser
import requests

from utils.constants import BROWSER_USER_AGENT
from utils.date_utils import _parse_localized_date, get_within_weeks, is_recent_job
from utils.env import get_int_env, is_truthy_env
from utils.log import scraper_log
from utils.normalize import normalize_job_data
from utils.url import normalize_listing_url


class BaseFeedScraper:
    """Base scraper for RSS/Atom feeds. No browser needed.

    HOW TO ADD A NEW FEED SCRAPER
    =============================

    1. Create scrapers/<site>.py with a class that extends BaseFeedScraper.

    2. Override ``parse_entry(entry)`` to extract job fields from a feed entry.
       Return a dict with any of: job_title, date_posted, description,
       organization, location, wage, employment_type, close_date, listing_url.
       Return ``None`` to skip the entry entirely.

    3. Optionally override:
       - ``get_feed_url()`` — if the feed URL differs from ``source["url"]``
       - ``get_request_headers()`` — to add custom HTTP headers
       - ``post_process_jobs(jobs)`` — for batch post-processing (e.g. LLM)

    4. Register in scrapers/registry.py like any other scraper.
    """

    # ---- Class-level configuration (override in subclasses) ----
    is_chronological = False
    language = "en"
    date_language = None
    # HTTP timeout for fetching the feed (seconds)
    feed_timeout = 30

    def __init__(self, source: dict[str, Any]):
        self.source = source
        # Interface expected by ScraperOrchestrator
        self.existing_urls: set[str] = set()
        self.skipped_duplicates = 0
        self.total_listings_found = 0
        self.scraped_urls: set[str] = set()
        self.jobs: list[dict[str, Any]] = []
        # Resolve job limits once at construction time so they're stable
        self._max_jobs = get_int_env("MAX_JOBS_PER_SOURCE")

    # ---- Subclass hooks ----

    def get_feed_url(self) -> str:
        """Return the feed URL to fetch. Override if different from source URL."""
        return self.source["url"]

    def get_request_headers(self) -> dict[str, str]:
        """Return HTTP headers for the feed request."""
        return {
            "User-Agent": BROWSER_USER_AGENT,
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
            "Accept-Language": "en-CA,en-US;q=0.9,en;q=0.8",
        }

    def parse_entry(self, entry: feedparser.FeedParserDict) -> dict[str, Any] | None:
        """Extract job fields from a single feed entry.

        Override in subclasses for feed-specific extraction logic.
        Return None to skip the entry.
        """
        title = entry.get("title")
        link = entry.get("link")

        if not title or not link:
            return None

        # Resolve relative URLs
        link = urllib.parse.urljoin(self.get_feed_url(), link)

        # Prefer content:encoded (full HTML) over summary (truncated)
        description = ""
        content_list = entry.get("content")
        if content_list and isinstance(content_list, list):
            description = content_list[0].get("value", "")
        if not description:
            description = entry.get("summary", "")

        date_str = entry.get("published") or entry.get("updated")

        return {
            "job_title": title.strip(),
            "listing_url": link.strip(),
            "date_posted": date_str,
            "description": description,
        }

    def post_process_jobs(self, jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Hook for batch post-processing after all entries are parsed."""
        return jobs

    # ---- Main flow ----

    def fetch_jobs(self, headless=True) -> list[dict[str, Any]]:
        """Fetch and parse the RSS/Atom feed. Returns list of job dicts."""
        feed = self._fetch_feed_content()
        scraper_log(f"\tFeed parsed: {len(feed.entries)} entries")

        lang = self.date_language or self.language or "en"
        weeks = get_within_weeks()
        skip_on_existing = not is_truthy_env("SHOULD_OVERRIDE_EXISTING")

        for i, entry in enumerate(feed.entries):
            if self._max_jobs is not None and len(self.jobs) >= self._max_jobs:
                scraper_log(f"\t🛑 Reached max jobs limit ({self._max_jobs}).")
                break

            self.total_listings_found += 1

            job_dict, should_break = self._process_single_entry(
                entry, i, lang, weeks, skip_on_existing
            )
            if job_dict:
                self.jobs.append(job_dict)

            if should_break:
                break

        self.jobs = self.post_process_jobs(self.jobs)
        return self.jobs

    def _fetch_feed_content(self) -> feedparser.FeedParserDict:
        feed_url = self.get_feed_url()
        scraper_log(f"\tFetching feed: {feed_url}")
        try:
            response = requests.get(
                feed_url,
                headers=self.get_request_headers(),
                timeout=self.feed_timeout,
            )
            response.raise_for_status()
        except requests.RequestException as e:
            raise RuntimeError(f"Failed to fetch feed {feed_url}: {e}") from e

        feed = feedparser.parse(response.content)
        if feed.bozo and not feed.entries:
            raise RuntimeError(f"Feed parse error for {feed_url}: {feed.bozo_exception}")
        return feed

    def _process_single_entry(
        self, entry: feedparser.FeedParserDict, index: int, lang: str, weeks: int, skip_on_existing: bool
    ) -> tuple[dict[str, Any] | None, bool]:
        """Process a single feed entry. Returns (job_dict, should_break)."""
        fields = self.parse_entry(entry)
        if fields is None:
            scraper_log(f"\t\tSkipping entry {index + 1}: parse_entry returned None")
            return None, False

        listing_url = fields.get("listing_url", "")
        norm_url = normalize_listing_url(listing_url)
        if not norm_url:
            scraper_log(f"\t\tSkipping entry {index + 1}: no valid URL")
            return None, False

        if norm_url in self.existing_urls and skip_on_existing:
            scraper_log(f"\t\tSkipping entry {index + 1} ({listing_url}): already in database")
            self.skipped_duplicates += 1
            return None, False

        if norm_url in self.scraped_urls:
            scraper_log(f"\t\tSkipping entry {index + 1} ({listing_url}): already scraped")
            return None, False
        self.scraped_urls.add(norm_url)

        date_str = fields.get("date_posted")
        title = fields.get("job_title", "Unknown")
        if date_str:
            if not is_recent_job(date_str, weeks=weeks, lang=lang):
                scraper_log(f"\t\tSkipping outdated entry {index + 1}: '{title}'")
                if self.is_chronological:
                    scraper_log("\t\tStopping early: chronological feed encountered non-recent entry")
                    return None, True
                return None, False
            scraper_log(f"\t\tProcessing entry {index + 1}: '{title}' posted {date_str}")
        else:
            scraper_log(f"\t\tProcessing entry {index + 1}: '{title}' (date not available)")

        if date_str:
            try:
                dt = _parse_localized_date(date_str, lang=lang)
                fields["date_posted"] = dt.isoformat()
            except Exception:
                pass

        if not fields.get("employment_type"):
            from utils.extractors import detect_employment_type_from_texts

            fields["employment_type"] = detect_employment_type_from_texts(
                [fields.get("job_title"), fields.get("description"), fields.get("wage")]
            )

        fields["listing_url"] = norm_url
        fields["language"] = fields.get("language", self.language or "en")

        job_dict = normalize_job_data({
            "job_title": fields.get("job_title"),
            "date_posted": fields.get("date_posted"),
            "close_date": fields.get("close_date"),
            "description": fields.get("description", ""),
            "summary": fields.get("summary"),
            "organization": fields.get("organization"),
            "location": fields.get("location"),
            "listing_url": fields.get("listing_url"),
            "employment_type": fields.get("employment_type"),
            "wage": fields.get("wage"),
            "language": fields.get("language"),
        })

        return job_dict, False

    def close_browser(self):
        """No-op. Required by ScraperOrchestrator's finally-block cleanup."""
        pass
