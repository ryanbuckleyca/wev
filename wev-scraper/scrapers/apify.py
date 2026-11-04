"""Apify actor ``getascraper/jobbank-scraper`` — Canada Job Bank inventory.

Runs the actor with bearer ``APIFY_API_TOKEN``, maps posting records into the
same Wev job fields as other scrapers, then normalizes.

Offline testing: set ``APIFY_JOBBANK_SAMPLE_PATH`` (or ``JOBBANK_SAMPLE_PATH``)
to a JSON array (or ``{data:[...]}``) of getascraper records — no Apify call.

Listings originate on jobbank.gc.ca; prefer that ``url`` as ``listing_url``.
``application_url`` is kept when present for apply routing later.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import requests

from utils.date_utils import _parse_localized_date, get_within_weeks, is_recent_job
from utils.env import get_int_env
from utils.log import scraper_log
from utils.normalize import normalize_job_data
from utils.url import normalize_listing_url

DEFAULT_ACTOR_ID = "getascraper/jobbank-scraper"
APIFY_API_BASE = "https://api.apify.com/v2"
DEFAULT_WAIT_SECS = 300


def _actor_path(actor_id: str) -> str:
    """Apify URL path uses ``user~name``; accept ``user/name`` in env."""
    return actor_id.strip().replace("/", "~")


class ApifyJobBankScraper:
    """Apify scraper for Canada Job Bank (getascraper/jobbank-scraper actor)."""

    is_chronological = False
    language = "en"
    request_timeout = 60

    def __init__(self, source: dict[str, Any]):
        self.source = source
        self.existing_urls: set[str] = set()
        self.skipped_duplicates = 0
        self.total_listings_found = 0
        self.scraped_urls: set[str] = set()
        self.jobs: list[dict[str, Any]] = []
        self._max_jobs = get_int_env("MAX_JOBS_PER_SOURCE")

    def get_sample_path(self) -> str | None:
        raw = (
            os.environ.get("APIFY_JOBBANK_SAMPLE_PATH")
            or os.environ.get("JOBBANK_SAMPLE_PATH")
            or ""
        ).strip()
        return raw or None

    def get_actor_id(self) -> str:
        return (
            os.environ.get("APIFY_JOBBANK_ACTOR") or DEFAULT_ACTOR_ID
        ).strip() or DEFAULT_ACTOR_ID

    def get_token(self) -> str:
        token = (os.environ.get("APIFY_API_TOKEN") or "").strip()
        if not token:
            raise RuntimeError("APIFY_API_TOKEN is required for Apify Job Bank scrape")
        return token

    def build_actor_input(self, limit: int) -> dict[str, Any]:
        """Canada-scoped actor input. Keyword/location optional via env."""
        payload: dict[str, Any] = {
            "maxItems": limit,
            "proxyConfiguration": {"useApifyProxy": True},
        }
        keyword = (os.environ.get("APIFY_JOBBANK_KEYWORD") or "").strip()
        location = (os.environ.get("APIFY_JOBBANK_LOCATION") or "").strip()
        if keyword:
            payload["searchKeyword"] = keyword
        if location:
            payload["location"] = location
        start_urls_raw = (os.environ.get("APIFY_JOBBANK_START_URLS") or "").strip()
        if start_urls_raw:
            urls = [u.strip() for u in start_urls_raw.split(",") if u.strip()]
            if urls:
                payload["startUrls"] = [{"url": u} for u in urls]
        return payload

    def fetch_jobs(self) -> list[dict[str, Any]]:
        sample_path = self.get_sample_path()
        if sample_path:
            records = self._load_sample_records(sample_path)
            scraper_log(f"\tApify Job Bank sample: {len(records)} from {sample_path}")
        else:
            limit = self._max_jobs or get_int_env("APIFY_JOBBANK_MAX_ITEMS") or 50
            records = self._run_actor(limit)
            scraper_log(f"\tApify Job Bank returned {len(records)} jobs")

        self.total_listings_found = len(records)
        weeks = get_within_weeks()
        skip_on_existing = True
        compare_only = False

        for index, record in enumerate(records):
            if self._max_jobs and len(self.jobs) >= self._max_jobs:
                break
            if not isinstance(record, dict):
                continue
            job_dict, _ = self._process_record(
                record,
                index,
                weeks=weeks,
                skip_on_existing=skip_on_existing,
                compare_only=compare_only,
            )
            if job_dict:
                self.jobs.append(job_dict)

        return self.jobs

    def _load_sample_records(self, sample_path: str) -> list[dict[str, Any]]:
        path = Path(sample_path).expanduser()
        if not path.is_file():
            raise RuntimeError(f"APIFY_JOBBANK_SAMPLE_PATH not found: {path}")
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise RuntimeError(f"Invalid Apify Job Bank sample JSON at {path}: {e}") from e

        if isinstance(payload, list):
            records = payload
        elif isinstance(payload, dict):
            records = payload.get("data") or payload.get("items") or []
        else:
            raise RuntimeError(
                f"Apify Job Bank sample JSON must be a list or {{data: [...]}}: {path}"
            )
        if not isinstance(records, list):
            raise RuntimeError(f"Apify Job Bank sample data must be a list: {path}")
        return [r for r in records if isinstance(r, dict)]

    def _run_actor(self, limit: int) -> list[dict[str, Any]]:
        token = self.get_token()
        actor = _actor_path(self.get_actor_id())
        wait = get_int_env("APIFY_JOBBANK_WAIT_SECS") or DEFAULT_WAIT_SECS
        run_url = (
            f"{APIFY_API_BASE}/acts/{actor}/runs"
            f"?token={token}&waitForFinish={wait}"
        )
        actor_input = self.build_actor_input(limit)
        scraper_log(
            f"\tStarting Apify actor {self.get_actor_id()} "
            f"(maxItems={actor_input.get('maxItems')}, "
            f"keyword={actor_input.get('searchKeyword')!r}, "
            f"location={actor_input.get('location')!r})"
        )
        try:
            with requests.post(
                run_url,
                json=actor_input,
                headers={"Content-Type": "application/json"},
                timeout=wait + self.request_timeout,
            ) as response:
                response.raise_for_status()
                run = response.json().get("data") or {}
        except requests.RequestException as e:
            raise RuntimeError(f"Failed to start Apify Job Bank run: {e}") from e

        status = run.get("status")
        dataset_id = run.get("defaultDatasetId")
        if status != "SUCCEEDED":
            raise RuntimeError(
                f"Apify Job Bank run did not succeed: status={status} "
                f"id={run.get('id')} message={run.get('statusMessage')}"
            )
        if not dataset_id:
            raise RuntimeError("Apify Job Bank run missing defaultDatasetId")

        return self._fetch_dataset_items(dataset_id, token)

    def _fetch_dataset_items(self, dataset_id: str, token: str) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        offset = 0
        page_size = 250
        while True:
            url = (
                f"{APIFY_API_BASE}/datasets/{dataset_id}/items"
                f"?token={token}&format=json&clean=1&offset={offset}&limit={page_size}"
            )
            try:
                with requests.get(url, timeout=self.request_timeout) as response:
                    response.raise_for_status()
                    batch = response.json()
            except requests.RequestException as e:
                raise RuntimeError(f"Failed to fetch Apify dataset {dataset_id}: {e}") from e
            if not isinstance(batch, list):
                raise RuntimeError("Apify dataset items response was not a JSON array")
            items.extend(r for r in batch if isinstance(r, dict))
            if len(batch) < page_size:
                break
            offset += page_size
            time.sleep(0.2)
        return items

    def _process_record(
        self,
        record: dict[str, Any],
        index: int,
        *,
        weeks: int,
        skip_on_existing: bool,
        compare_only: bool,
    ) -> tuple[dict[str, Any] | None, bool]:
        fields = self.parse_job(record)
        if fields is None:
            scraper_log(f"\t\tSkipping job {index + 1}: parse_job returned None")
            return None, False

        listing_url = fields.get("listing_url", "")
        norm_url = normalize_listing_url(listing_url)
        if not norm_url:
            scraper_log(f"\t\tSkipping job {index + 1}: no valid URL")
            return None, False

        if norm_url in self.existing_urls and skip_on_existing:
            scraper_log(f"\t\tSkipping job {index + 1} ({listing_url}): already in database")
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
        self.scraped_urls.add(norm_url)

        date_str = fields.get("date_posted")
        title = fields.get("job_title", "Unknown")
        if date_str:
            if not is_recent_job(date_str, weeks=weeks, lang=self.language):
                scraper_log(f"\t\tSkipping outdated job {index + 1}: '{title}'")
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
                "municipality": fields.get("municipality"),
                "province": fields.get("province"),
                "listing_url": fields.get("listing_url"),
                "employment_type": fields.get("employment_type"),
                "wage": fields.get("wage"),
                "language": fields.get("language"),
                "website": fields.get("website"),
                "is_remote": fields.get("is_remote"),
                "work_type": fields.get("work_type"),
            }
        )
        return job_dict, False

    def parse_job(self, record: dict[str, Any]) -> dict[str, Any] | None:
        """Map one getascraper Job Bank record to Wev fields. Return None to skip."""
        title = (record.get("title") or record.get("original_title") or "").strip()
        organization = (record.get("employer") or "").strip()
        listing_url = (record.get("url") or "").strip()
        if not title or not organization or not listing_url:
            return None

        description = record.get("description") or ""
        if not isinstance(description, str):
            description = str(description)

        city = (record.get("city") or "").strip() or None
        province = (record.get("province") or "").strip() or None
        location = (record.get("location") or "").strip() or None
        if not location:
            parts = [p for p in (city, province) if p]
            location = ", ".join(parts) if parts else None

        workplace = (record.get("workplace_type") or record.get("work_type") or "").lower()
        is_remote = "remote" in workplace or "telework" in workplace
        work_type = "remote" if is_remote else ("hybrid" if "hybrid" in workplace else "onsite")

        website = (record.get("employer_website") or "").strip() or None
        apply_url = (record.get("application_url") or "").strip() or None

        return {
            "job_title": title,
            "organization": organization,
            "listing_url": listing_url,
            "description": description,
            "location": location,
            "municipality": city,
            "province": province,
            "wage": self._format_wage(record),
            "employment_type": self._employment_type(record),
            "date_posted": self._date_posted(record),
            "close_date": record.get("expiry_date") or record.get("valid_through"),
            "website": website,
            "is_remote": is_remote,
            "work_type": work_type,
            "_apply_url": apply_url,
            "_noc_code": record.get("noc_code"),
            "_source_job_id": record.get("internal_id") or record.get("job_id"),
            "_stable_id": record.get("stable_id"),
        }

    def _format_wage(self, record: dict[str, Any]) -> str | None:
        currency = (record.get("salary_currency") or "CAD").upper()
        unit = (record.get("salary_unit") or "").strip().lower()
        period = {
            "hour": "hour",
            "hourly": "hour",
            "year": "year",
            "annual": "year",
            "annually": "year",
            "month": "month",
            "monthly": "month",
            "week": "week",
            "weekly": "week",
            "day": "day",
            "daily": "day",
        }.get(unit, unit or None)

        mn, mx = record.get("salary_min"), record.get("salary_max")
        if mn is not None or mx is not None:
            if mn is not None and mx is not None and mn != mx:
                amount = f"${mn} - ${mx}"
            else:
                amount = f"${mn if mn is not None else mx}"
            parts = [amount, currency]
            if period:
                parts.append(period)
            return " ".join(parts)

        raw = (record.get("salary") or record.get("salaryText") or "").strip()
        return raw or None

    def _employment_type(self, record: dict[str, Any]) -> str | None:
        raw = (record.get("employment_type") or "").strip().lower()
        if not raw:
            return None
        mapping = {
            "full time": "full-time",
            "full-time": "full-time",
            "part time": "part-time",
            "part-time": "part-time",
            "contract": "contract",
            "temporary": "temporary",
            "seasonal": "temporary",
            "seasonal employment": "temporary",
            "internship": "internship",
            "volunteer": "volunteer",
            "casual": "part-time",
        }
        if raw in mapping:
            return mapping[raw]
        if "full" in raw:
            return "full-time"
        if "part" in raw:
            return "part-time"
        if "season" in raw or "temp" in raw:
            return "temporary"
        if "contract" in raw:
            return "contract"
        return raw.replace(" ", "-")

    def _date_posted(self, record: dict[str, Any]) -> str | None:
        for key in ("date_posted", "posted_date", "date_posted_raw"):
            value = record.get(key)
            if value:
                return str(value).strip()
        return None
