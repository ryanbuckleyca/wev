"""Shared base for JSON/HTTP API job scrapers (no browser).

Sibling of ``BaseFeedScraper``: same orchestrator contract (``fetch_jobs``,
``close_browser``, ``existing_urls``, …) without Playwright or feedparser.
Subclasses own auth, pagination, and ``parse_job``.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from utils.date_utils import _parse_localized_date, is_recent_job
from utils.env import get_int_env, is_truthy_env
from utils.log import scraper_log
from utils.normalize import normalize_job_data
from utils.url import normalize_listing_url

_NORMALIZE_KEYS = (
    "job_title",
    "date_posted",
    "close_date",
    "description",
    "summary",
    "organization",
    "location",
    "municipality",
    "province",
    "lat",
    "lng",
    "listing_url",
    "employment_type",
    "wage",
    "language",
    "website",
    "is_remote",
    "work_type",
)


class BaseApiScraper:
    """Base for Canada JSON API scrapers used by ScraperOrchestrator."""

    is_chronological = False
    language = "en"
    # Env vars checked in order by ``get_sample_path`` (first non-empty wins).
    sample_path_envs: tuple[str, ...] = ()
    # Keys tried when sample JSON is an object rather than a bare list.
    sample_list_keys: tuple[str, ...] = ("data", "jobs", "items")
    # When True, record the URL in ``scraped_urls`` only after it passes the
    # recency filter (SerpApi: same apply URL may reappear with a fresher date).
    defer_scraped_url_until_accepted = False
    # Fill missing employment_type from title/description/wage text.
    auto_detect_employment_type = True

    def __init__(self, source: dict[str, Any]):
        """Bind a sources-row dict and reset per-run scrape counters."""
        self.source = source
        self.existing_urls: set[str] = set()
        self.skipped_duplicates = 0
        self.total_listings_found = 0
        self.scraped_urls: set[str] = set()
        self.jobs: list[dict[str, Any]] = []
        self._max_jobs = get_int_env("MAX_JOBS_PER_SOURCE")

    def get_sample_path(self) -> str | None:
        """Return the first configured offline sample path, if any."""
        for key in self.sample_path_envs:
            raw = (os.environ.get(key) or "").strip()
            if raw:
                return raw
        return None

    def parse_job(self, record: dict[str, Any]) -> dict[str, Any] | None:
        """Map one provider record to Wev fields. Return None to skip."""
        raise NotImplementedError(f"{type(self).__name__}.parse_job is required")

    def close_browser(self) -> None:
        """No-op. Required by ScraperOrchestrator's finally-block cleanup."""

    def _load_sample_records(self, sample_path: str) -> list[dict[str, Any]]:
        """Load job dicts from a local JSON sample (list or keyed object)."""
        path = Path(sample_path).expanduser()
        label = self.sample_path_envs[0] if self.sample_path_envs else "sample path"
        if not path.is_file():
            raise RuntimeError(f"{label} not found: {path}")
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise RuntimeError(f"Invalid sample JSON at {path}: {e}") from e

        if isinstance(payload, list):
            records = payload
        elif isinstance(payload, dict):
            records = []
            for key in self.sample_list_keys:
                candidate = payload.get(key)
                if isinstance(candidate, list):
                    records = candidate
                    break
            if not records and not any(
                isinstance(payload.get(k), list) for k in self.sample_list_keys
            ):
                raise RuntimeError(
                    f"Sample JSON must be a list or object with one of "
                    f"{list(self.sample_list_keys)}: {path}"
                )
        else:
            raise RuntimeError(
                f"Sample JSON must be a list or object with job records: {path}"
            )
        if not isinstance(records, list):
            raise RuntimeError(f"Sample job list must be a list: {path}")
        return [r for r in records if isinstance(r, dict)]

    def _at_job_limit(self) -> bool:
        """True when ``MAX_JOBS_PER_SOURCE`` has been reached."""
        return self._max_jobs is not None and len(self.jobs) >= self._max_jobs

    def _prepare_date_posted(self, fields: dict[str, Any]) -> None:
        """Optional hook to coerce ``date_posted`` before the recency check."""

    def _should_stop_before_accept(
        self,
        record: dict[str, Any],
        fields: dict[str, Any],
        *,
        weeks: int,
    ) -> bool:
        """Optional early pagination stop (e.g. Headcount stale ``job_updated_at``)."""
        return False

    def _process_record(
        self,
        record: dict[str, Any],
        index: int,
        *,
        weeks: int,
        skip_on_existing: bool | None = None,
        compare_only: bool | None = None,
    ) -> tuple[dict[str, Any] | None, bool]:
        """Parse + filter one API record. Returns ``(job_dict|None, should_stop)``."""
        if skip_on_existing is None:
            skip_on_existing = not is_truthy_env("SHOULD_OVERRIDE_EXISTING")
        if compare_only is None:
            compare_only = is_truthy_env("COMPARE_ONLY")

        if not isinstance(record, dict):
            scraper_log(
                f"\t\tSkipping job {index + 1}: record is {type(record).__name__}, "
                "expected dict"
            )
            return None, False

        try:
            fields = self.parse_job(record)
        except (TypeError, AttributeError, ValueError) as e:
            # Malformed provider fields (e.g. non-string employer) must not abort
            # the whole source run — skip and keep processing siblings.
            scraper_log(
                f"\t\tSkipping job {index + 1}: malformed record ({type(e).__name__}: {e})"
            )
            return None, False
        if not fields:
            scraper_log(f"\t\tSkipping job {index + 1}: parse_job returned None")
            return None, False

        listing_url = fields.get("listing_url", "")
        if listing_url is not None and not isinstance(listing_url, str):
            scraper_log(
                f"\t\tSkipping job {index + 1}: listing_url is "
                f"{type(listing_url).__name__}, expected string"
            )
            return None, False
        for key in ("job_title", "organization"):
            value = fields.get(key)
            if value is not None and not isinstance(value, str):
                scraper_log(
                    f"\t\tSkipping job {index + 1}: {key} is "
                    f"{type(value).__name__}, expected string"
                )
                return None, False

        norm_url = normalize_listing_url(listing_url)
        if not norm_url:
            scraper_log(f"\t\tSkipping job {index + 1}: no valid URL")
            return None, False

        if norm_url in self.existing_urls and skip_on_existing and not compare_only:
            scraper_log(
                f"\t\tSkipping job {index + 1} ({listing_url}): already in database"
            )
            self.skipped_duplicates += 1
            return None, False

        if compare_only and norm_url not in self.existing_urls:
            scraper_log(
                f"\t\tSkipping job {index + 1} ({listing_url}): new URL (compare-only mode)"
            )
            return None, False

        if norm_url in self.scraped_urls:
            scraper_log(f"\t\tSkipping job {index + 1} ({listing_url}): already scraped")
            return None, False

        if self._should_stop_before_accept(record, fields, weeks=weeks):
            return None, True

        if not self.defer_scraped_url_until_accepted:
            self.scraped_urls.add(norm_url)

        original_date = fields.get("date_posted")
        self._prepare_date_posted(fields)
        date_str = fields.get("date_posted")
        title = fields.get("job_title", "Unknown")
        lang = self.language or "en"
        if date_str:
            if not is_recent_job(str(date_str), weeks=weeks, lang=lang):
                scraper_log(f"\t\tSkipping outdated job {index + 1}: '{title}'")
                if self.is_chronological:
                    scraper_log(
                        "\t\tStopping early: chronological API page encountered "
                        "non-recent job"
                    )
                    return None, True
                return None, False
            scraper_log(f"\t\tProcessing job {index + 1}: '{title}' posted {date_str}")
            # Skip when ``_prepare_date_posted`` already rewrote the value
            # (e.g. SerpApi ``3 days ago`` → ISO date).
            if date_str == original_date:
                try:
                    dt = _parse_localized_date(str(date_str), lang=lang)
                    fields["date_posted"] = dt.isoformat()
                except Exception:
                    pass
        else:
            scraper_log(
                f"\t\tProcessing job {index + 1}: '{title}' (date not available)"
            )

        if self.defer_scraped_url_until_accepted:
            self.scraped_urls.add(norm_url)

        if self.auto_detect_employment_type and not fields.get("employment_type"):
            from utils.extractors import detect_employment_type_from_texts

            fields["employment_type"] = detect_employment_type_from_texts(
                [fields.get("job_title"), fields.get("description"), fields.get("wage")]
            )

        fields["listing_url"] = norm_url
        fields["language"] = fields.get("language") or self.language or "en"

        payload = {key: fields.get(key) for key in _NORMALIZE_KEYS}
        payload["description"] = fields.get("description", "") or ""
        payload["listing_url"] = norm_url
        payload["language"] = fields["language"]
        payload["website"] = fields.get("website") or fields.get("organization_website")
        payload["source_dump"] = record

        return normalize_job_data(payload), False
