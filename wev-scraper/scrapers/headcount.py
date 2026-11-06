"""Headcount Labs jobs API scraper.

Pulls public Canadian jobs from ``GET /v1/jobs`` with bearer auth and cursor
pagination. Headcount does not expose structured skills — description text is
saved and the normal scrape post-processing (SSE / values / ESCO skills)
handles enrichment like every other source.

Offline / signup-blocked testing: set ``HEADCOUNTLABS_SAMPLE_PATH`` to a JSON
file of Headcount job records (array or ``{data: [...]}``). No API key needed.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import requests

from utils.constants import BROWSER_USER_AGENT
from utils.date_utils import _parse_localized_date, get_within_weeks, is_recent_job
from utils.env import get_int_env, is_truthy_env
from utils.log import scraper_log
from utils.normalize import normalize_job_data
from utils.url import normalize_listing_url

DEFAULT_BASE_URL = "https://api.headcountlabs.com"
DEFAULT_PAGE_LIMIT = 50


def _state_value(field: Any) -> Any:
    """Unwrap a Headcount state-bearing field to its ``value``, or pass through."""
    if field is None:
        return None
    if isinstance(field, dict) and "state" in field:
        if field.get("state") in {"known", "derived"}:
            return field.get("value")
        return None
    return field


def _format_location(loc_value: Any) -> str | None:
    """Format a Headcount location value dict into a display string."""
    if not isinstance(loc_value, dict):
        return None
    city = (loc_value.get("city") or "").strip()
    region = (loc_value.get("region") or loc_value.get("state") or "").strip()
    country = (loc_value.get("country") or "").strip()
    # Prefer "City, ON, CA" style; region may already be "CA-ON"
    parts = [p for p in (city, region, country) if p]
    if not parts:
        return None
    return ", ".join(parts)


def _format_wage(pay_value: Any) -> str | None:
    """Format a Headcount pay value dict into a wage display string."""
    if not isinstance(pay_value, dict):
        return None
    currency = (pay_value.get("currency") or "").upper()
    interval = (pay_value.get("interval") or "").strip()
    pay_min = pay_value.get("min")
    pay_max = pay_value.get("max")
    suffix = " ".join(p for p in (currency, interval) if p)

    if pay_min is not None and pay_max is not None:
        if pay_min == pay_max:
            amount = f"${pay_min}"
        else:
            amount = f"${pay_min} - ${pay_max}"
    elif pay_min is not None:
        amount = f"${pay_min}"
    elif pay_max is not None:
        amount = f"${pay_max}"
    else:
        return None
    return f"{amount} {suffix}".strip() if suffix else amount


class HeadcountLabsScraper:
    """JSON API scraper for Headcount Labs public jobs (Canada-scoped)."""

    # Headcount pages are not strictly newest-first; keep scanning past stale rows.
    is_chronological = False
    language = "en"
    request_timeout = 30
    _FETCH_MAX_ATTEMPTS = 4
    # Safety bound when MAX_JOBS_PER_SOURCE is unset (updated-sort has no natural end).
    _MAX_PAGES = 40

    def __init__(self, source: dict[str, Any]):
        self.source = source
        self.existing_urls: set[str] = set()
        self.skipped_duplicates = 0
        self.total_listings_found = 0
        self.scraped_urls: set[str] = set()
        self.jobs: list[dict[str, Any]] = []
        self._max_jobs = get_int_env("MAX_JOBS_PER_SOURCE")

    def get_base_url(self) -> str:
        """Return the Headcount API base URL (env override or default)."""
        return (os.environ.get("HEADCOUNTLABS_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")

    def get_sample_path(self) -> str | None:
        """Return offline sample path when ``HEADCOUNTLABS_SAMPLE_PATH`` is set."""
        raw = (os.environ.get("HEADCOUNTLABS_SAMPLE_PATH") or "").strip()
        return raw or None

    @staticmethod
    def is_configured() -> bool:
        """True when a live API key or offline sample path is available."""
        if (os.environ.get("HEADCOUNTLABS_SAMPLE_PATH") or "").strip():
            return True
        return bool((os.environ.get("HEADCOUNTLABS_API_KEY") or "").strip())

    def get_api_key(self) -> str:
        """Return the Headcount API key or raise when unset."""
        key = (os.environ.get("HEADCOUNTLABS_API_KEY") or "").strip()
        if not key:
            raise RuntimeError(
                "HEADCOUNTLABS_API_KEY is not set. Create a key at "
                "https://api.headcountlabs.com/data/keys and add it to .env, "
                "or set HEADCOUNTLABS_SAMPLE_PATH to a local sample JSON file."
            )
        return key

    def get_request_headers(self) -> dict[str, str]:
        """Bearer auth headers for Headcount list requests."""
        return {
            "Authorization": f"Bearer {self.get_api_key()}",
            "User-Agent": BROWSER_USER_AGENT,
            "Accept": "application/json",
        }

    def build_list_params(self, *, cursor: str | None = None) -> dict[str, str]:
        """Build query params for ``GET /v1/jobs`` (Canada, has posting URL)."""
        limit = DEFAULT_PAGE_LIMIT
        if self._max_jobs is not None:
            limit = max(1, min(DEFAULT_PAGE_LIMIT, self._max_jobs))
        params: dict[str, str] = {
            "country": "CA",
            "has_posting_url": "true",
            "limit": str(limit),
            "sort": "updated",
            "include": "company",
        }
        if cursor:
            params["cursor"] = cursor
        return params

    def fetch_jobs(self, **kwargs) -> list[dict[str, Any]]:
        """Fetch Canada jobs from Headcount (live API or offline sample)."""
        weeks = get_within_weeks()
        skip_on_existing = not is_truthy_env("SHOULD_OVERRIDE_EXISTING")
        compare_only = is_truthy_env("COMPARE_ONLY")

        sample_path = self.get_sample_path()
        if sample_path:
            records = self._load_sample_records(sample_path)
            scraper_log(f"\tHeadcount sample file: {len(records)} jobs from {sample_path}")
            self._ingest_records(
                records,
                weeks=weeks,
                skip_on_existing=skip_on_existing,
                compare_only=compare_only,
                # Sample files are not guaranteed updated-sorted.
                stop_on_stale_updated=False,
            )
            return self.jobs

        cursor: str | None = None
        followed_cursors: set[str] = set()
        pages_fetched = 0
        while True:
            if self._max_jobs is not None and len(self.jobs) >= self._max_jobs:
                scraper_log(f"\tReached max jobs limit ({self._max_jobs}).")
                break
            if pages_fetched >= self._MAX_PAGES:
                scraper_log(
                    f"\tReached Headcount page cap ({self._MAX_PAGES}); stopping."
                )
                break

            try:
                page = self._fetch_page(cursor)
            except RuntimeError as e:
                # Keep jobs from earlier pages so the orchestrator can still
                # save/compare them rather than discarding the whole run.
                if self.jobs:
                    scraper_log(
                        f"\tStopping Headcount pagination after fetch error "
                        f"(keeping {len(self.jobs)} job(s)): {e}"
                    )
                    break
                raise
            pages_fetched += 1

            raw_data = page.get("data")
            if not raw_data:
                records: list[Any] = []
            elif not isinstance(raw_data, list):
                raise RuntimeError(
                    "Headcount jobs response `data` must be a list, "
                    f"got {type(raw_data).__name__}"
                )
            else:
                records = raw_data
            scraper_log(f"\tHeadcount page: {len(records)} jobs")

            stop = self._ingest_records(
                records,
                weeks=weeks,
                skip_on_existing=skip_on_existing,
                compare_only=compare_only,
                stop_on_stale_updated=True,
            )
            if stop:
                break

            next_cursor = page.get("next_cursor")
            if not next_cursor:
                break
            next_s = str(next_cursor)
            if next_s in followed_cursors:
                scraper_log("\tRepeated next_cursor; stopping Headcount pagination")
                break
            followed_cursors.add(next_s)
            cursor = next_s

        return self.jobs

    def _ingest_records(
        self,
        records: list[Any],
        *,
        weeks: int,
        skip_on_existing: bool,
        compare_only: bool,
        stop_on_stale_updated: bool = False,
    ) -> bool:
        """Process a list of Headcount job records. Returns True to stop paging."""
        for index, record in enumerate(records):
            if self._max_jobs is not None and len(self.jobs) >= self._max_jobs:
                scraper_log(f"\tReached max jobs limit ({self._max_jobs}).")
                return True
            if not isinstance(record, dict):
                continue

            self.total_listings_found += 1
            job_dict, should_break = self._process_record(
                record,
                index,
                weeks=weeks,
                skip_on_existing=skip_on_existing,
                compare_only=compare_only,
                stop_on_stale_updated=stop_on_stale_updated,
            )
            if job_dict:
                self.jobs.append(job_dict)
            if should_break:
                return True
        return False

    def _load_sample_records(self, sample_path: str) -> list[dict[str, Any]]:
        """Load Headcount job dicts from a local JSON sample file."""
        path = Path(sample_path).expanduser()
        if not path.is_file():
            raise RuntimeError(f"HEADCOUNTLABS_SAMPLE_PATH not found: {path}")
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise RuntimeError(f"Invalid Headcount sample JSON at {path}: {e}") from e

        if isinstance(payload, list):
            records = payload
        elif isinstance(payload, dict):
            records = payload.get("data") or []
        else:
            raise RuntimeError(
                f"Headcount sample JSON must be a list or {{data: [...]}} object: {path}"
            )
        if not isinstance(records, list):
            raise RuntimeError(f"Headcount sample `data` must be a list: {path}")
        return [r for r in records if isinstance(r, dict)]

    def _fetch_page(self, cursor: str | None) -> dict[str, Any]:
        """GET one Headcount jobs page; retry HTTP 429/503 with bounded backoff."""
        params = self.build_list_params(cursor=cursor)
        url = f"{self.get_base_url()}/v1/jobs?{urlencode(params)}"
        scraper_log(f"\tFetching Headcount jobs: {url.split('?')[0]}?country=CA&...")
        last_error: Exception | None = None
        for attempt in range(1, self._FETCH_MAX_ATTEMPTS + 1):
            try:
                with requests.get(
                    url,
                    headers=self.get_request_headers(),
                    timeout=self.request_timeout,
                ) as response:
                    if response.status_code in (429, 503):
                        last_error = RuntimeError(
                            f"Headcount HTTP {response.status_code}"
                        )
                        if attempt >= self._FETCH_MAX_ATTEMPTS:
                            break
                        time.sleep(min(8.0, 0.5 * (2 ** (attempt - 1))))
                        continue
                    response.raise_for_status()
                    payload = response.json()
            except requests.RequestException as e:
                raise RuntimeError(f"Failed to fetch Headcount jobs: {e}") from e

            if not isinstance(payload, dict):
                raise RuntimeError("Headcount jobs response was not a JSON object")
            return payload

        raise RuntimeError(
            f"Failed to fetch Headcount jobs after {self._FETCH_MAX_ATTEMPTS} "
            f"retries: {last_error}"
        )

    def _process_record(
        self,
        record: dict[str, Any],
        index: int,
        *,
        weeks: int,
        skip_on_existing: bool,
        compare_only: bool,
        stop_on_stale_updated: bool = False,
    ) -> tuple[dict[str, Any] | None, bool]:
        """Map one Headcount record; return (job_dict|None, should_stop_paging)."""
        fields = self.parse_job(record)
        if fields is None:
            scraper_log(f"\t\tSkipping job {index + 1}: parse_job returned None")
            return None, False

        listing_url = fields.get("listing_url", "")
        norm_url = normalize_listing_url(listing_url)
        if not norm_url:
            scraper_log(f"\t\tSkipping job {index + 1}: no valid URL")
            return None, False

        # During --compare, keep existing URLs so the orchestrator can diff them.
        if norm_url in self.existing_urls and skip_on_existing and not compare_only:
            scraper_log(f"\t\tSkipping job {index + 1} ({listing_url}): already in database")
            self.skipped_duplicates += 1
            return None, False

        if compare_only and norm_url not in self.existing_urls:
            scraper_log(f"\t\tSkipping job {index + 1} ({listing_url}): new URL (compare-only mode)")
            return None, False

        if norm_url in self.scraped_urls:
            scraper_log(f"\t\tSkipping job {index + 1} ({listing_url}): already scraped")
            return None, False
        self.scraped_urls.add(norm_url)

        # Live updated-sort feed only: once job_updated_at falls outside the
        # window, later pages are older — stop even though is_chronological is
        # False. Offline samples are not ordered that way.
        updated_at = record.get("job_updated_at")
        if (
            stop_on_stale_updated
            and updated_at
            and not is_recent_job(str(updated_at), weeks=weeks, lang=self.language)
        ):
            scraper_log(
                f"\t\tStopping: job_updated_at outside recency window "
                f"({updated_at})"
            )
            return None, True

        date_str = fields.get("date_posted")
        title = fields.get("job_title", "Unknown")
        if date_str:
            if not is_recent_job(date_str, weeks=weeks, lang=self.language):
                scraper_log(f"\t\tSkipping outdated job {index + 1}: '{title}'")
                if self.is_chronological:
                    scraper_log(
                        "\t\tStopping early: chronological API page encountered non-recent job"
                    )
                    return None, True
                return None, False
            scraper_log(f"\t\tProcessing job {index + 1}: '{title}' posted {date_str}")
            try:
                dt = _parse_localized_date(date_str, lang=self.language)
                fields["date_posted"] = dt.isoformat()
            except Exception:
                pass
        else:
            scraper_log(f"\t\tProcessing job {index + 1}: '{title}' (date not available)")

        if not fields.get("employment_type"):
            from utils.extractors import detect_employment_type_from_texts

            fields["employment_type"] = detect_employment_type_from_texts(
                [fields.get("job_title"), fields.get("description"), fields.get("wage")]
            )

        fields["listing_url"] = norm_url
        fields["language"] = fields.get("language", self.language)

        job_dict = normalize_job_data(
            {
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
                "website": fields.get("website") or fields.get("organization_website"),
                "source_dump": record,
            }
        )
        return job_dict, False

    def parse_job(self, record: dict[str, Any]) -> dict[str, Any] | None:
        """Map one Headcount job record to Wev job fields. Return None to skip."""
        title = _state_value(record.get("title"))
        if isinstance(title, dict):
            title = title.get("value") or title.get("text")
        title = (str(title).strip() if title else "")

        organization = self._organization_name(record)
        listing_url = self._listing_url(record)
        if not title or not organization or not listing_url:
            return None

        description = _state_value(record.get("description")) or ""
        if not isinstance(description, str):
            description = str(description)

        location = self._location_text(record)
        wage = self._wage_text(record)
        employment_type = self._employment_type(record)
        date_posted = self._date_posted(record)
        website = self._organization_website(record)

        return {
            "job_title": title,
            "organization": organization,
            "listing_url": listing_url,
            "description": description,
            "location": location,
            "wage": wage,
            "employment_type": employment_type,
            "date_posted": date_posted,
            "website": website,
        }

    def _organization_name(self, record: dict[str, Any]) -> str | None:
        """Prefer company.name, then employer_name state field."""
        company = record.get("company")
        if isinstance(company, dict):
            name = (company.get("name") or "").strip()
            if name:
                return name
        employer = _state_value(record.get("employer_name"))
        if employer:
            return str(employer).strip() or None
        return None

    def _organization_website(self, record: dict[str, Any]) -> str | None:
        """First non-empty company website/domain/url."""
        company = record.get("company")
        if not isinstance(company, dict):
            return None
        for key in ("website", "domain", "url"):
            value = company.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    def _listing_url(self, record: dict[str, Any]) -> str | None:
        """First live posting URL; skip ``no_longer_listed`` postings."""
        postings = record.get("postings") or []
        if not isinstance(postings, list):
            return None
        for posting in postings:
            if not isinstance(posting, dict):
                continue
            status = _state_value(posting.get("posting_status"))
            if isinstance(status, str) and status.strip().lower() == "no_longer_listed":
                continue
            for key in ("posting_url", "application_url"):
                url = _state_value(posting.get(key))
                if isinstance(url, str) and url.strip():
                    return url.strip()
        return None

    def _location_text(self, record: dict[str, Any]) -> str | None:
        """Best-effort location string from locations[] or posting.location."""
        locations = record.get("locations") or []
        if isinstance(locations, list):
            for loc in locations:
                if not isinstance(loc, dict):
                    continue
                formatted = _format_location(_state_value(loc))
                if formatted:
                    return formatted

        postings = record.get("postings") or []
        if isinstance(postings, list):
            for posting in postings:
                if not isinstance(posting, dict):
                    continue
                formatted = _format_location(_state_value(posting.get("location")))
                if formatted:
                    return formatted
        return None

    def _wage_text(self, record: dict[str, Any]) -> str | None:
        """First posting pay value formatted as a wage string."""
        postings = record.get("postings") or []
        if not isinstance(postings, list):
            return None
        for posting in postings:
            if not isinstance(posting, dict):
                continue
            wage = _format_wage(_state_value(posting.get("pay")))
            if wage:
                return wage
        return None

    def _employment_type(self, record: dict[str, Any]) -> str | None:
        """Employment type from posting source_data when present."""
        postings = record.get("postings") or []
        if not isinstance(postings, list):
            return None
        for posting in postings:
            if not isinstance(posting, dict):
                continue
            source_data = posting.get("source_data") or {}
            if isinstance(source_data, dict):
                emp = source_data.get("employment_type")
                if emp:
                    return str(emp).lower().replace("_", "-").replace(" ", "-")
        return None

    def _date_posted(self, record: dict[str, Any]) -> str | None:
        """Prefer source_posted_at, then Headcount first-seen / updated stamps."""
        postings = record.get("postings") or []
        if isinstance(postings, list):
            for posting in postings:
                if not isinstance(posting, dict):
                    continue
                posted = posting.get("source_posted_at")
                if posted:
                    return str(posted)
        for key in ("job_first_seen_at", "job_updated_at", "curated_at"):
            value = record.get(key)
            if value:
                return str(value)
        return None

    def close_browser(self):
        """No-op. Required by ScraperOrchestrator's finally-block cleanup."""
        pass
