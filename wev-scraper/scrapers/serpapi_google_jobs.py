"""SerpApi Google Jobs — Canada-wide discovery (cost waterfall tier 1).

Broad CA coverage within SerpApi quota. No mission/SSE keyword narrowing —
``is_sse`` is applied later. Google's index already mixes LinkedIn, Glassdoor,
Indeed, Workday, etc.; richer boards are left to higher tiers.

Env:
  SERPAPI_API_KEY (required)
  SERPAPI_GOOGLE_JOBS_LOCATION (default Canada)
  SERPAPI_GOOGLE_JOBS_GL (default ca)
  SERPAPI_GOOGLE_JOBS_HL (default en)
  SERPAPI_GOOGLE_JOBS_QUERIES — comma-separated volume queries (neutral employment
    terms to page Google's index; not SSE filters)
  SERPAPI_GOOGLE_JOBS_MAX_PAGES — pages per query (10 jobs/page)
  SERPAPI_GOOGLE_JOBS_SAMPLE_PATH — offline JSON
"""

from __future__ import annotations

import os
import re
from typing import Any

import requests

from scrapers.base_api import BaseApiScraper
from utils.date_utils import get_within_weeks, parse_relative_posted_at
from utils.env import get_int_env
from utils.log import scraper_log

SERPAPI_ENDPOINT = "https://serpapi.com/search.json"
DEFAULT_QUERIES = (
    "hiring,job,full time,part time,remote,contract,permanent,temporary,internship"
)


class SerpApiGoogleJobsScraper(BaseApiScraper):
    """Canada Google Jobs via SerpApi (engine=google_jobs)."""

    language = "en"
    request_timeout = 60
    sample_path_envs = ("SERPAPI_GOOGLE_JOBS_SAMPLE_PATH",)
    sample_list_keys = ("jobs_results", "data", "jobs", "items")
    defer_scraped_url_until_accepted = True
    auto_detect_employment_type = False

    def get_api_key(self) -> str:
        """Return the SerpApi key or raise when unset."""
        key = (os.environ.get("SERPAPI_API_KEY") or "").strip()
        if not key:
            raise RuntimeError("SERPAPI_API_KEY is required for Google Jobs scrape")
        return key

    def get_queries(self) -> list[str]:
        """Return comma-split Google Jobs query strings from env (or defaults)."""
        raw = (os.environ.get("SERPAPI_GOOGLE_JOBS_QUERIES") or DEFAULT_QUERIES).strip()
        return [q.strip() for q in raw.split(",") if q.strip()]

    def fetch_jobs(self) -> list[dict[str, Any]]:
        """Fetch Canada Google Jobs listings (live API or offline sample)."""
        sample_path = self.get_sample_path()
        if sample_path:
            records = self._load_sample_records(sample_path)
            scraper_log(f"\tSerpApi Google Jobs sample: {len(records)} from {sample_path}")
        else:
            records = self._fetch_canada_jobs()
            scraper_log(f"\tSerpApi Google Jobs returned {len(records)} unique listings")

        self.total_listings_found = len(records)
        weeks = get_within_weeks()
        for index, record in enumerate(records):
            if self._max_jobs and len(self.jobs) >= self._max_jobs:
                break
            job_dict, _ = self._process_record(record, index, weeks=weeks)
            if job_dict:
                self.jobs.append(job_dict)
        return self.jobs

    def _fetch_canada_jobs(self) -> list[dict[str, Any]]:
        """Query SerpApi google_jobs across configured queries and pages."""
        key = self.get_api_key()
        location = (os.environ.get("SERPAPI_GOOGLE_JOBS_LOCATION") or "Canada").strip()
        gl = (os.environ.get("SERPAPI_GOOGLE_JOBS_GL") or "ca").strip()
        hl = (os.environ.get("SERPAPI_GOOGLE_JOBS_HL") or "en").strip()
        max_pages = get_int_env("SERPAPI_GOOGLE_JOBS_MAX_PAGES") or 3
        limit = self._max_jobs or get_int_env("SERPAPI_GOOGLE_JOBS_MAX_ITEMS") or 200

        by_key: dict[str, dict[str, Any]] = {}
        # Bound how many raw results we pull; ``limit`` applies to accepted rows.
        fetch_budget = max(limit * 3, limit + 50)
        fetched = 0
        for query in self.get_queries():
            if len(by_key) >= limit or fetched >= fetch_budget:
                break
            scraper_log(f"\tSerpApi google_jobs q={query!r} location={location!r}")
            next_token: str | None = None
            for page in range(max_pages):
                if len(by_key) >= limit or fetched >= fetch_budget:
                    break
                params: dict[str, Any] = {
                    "engine": "google_jobs",
                    "q": query,
                    "location": location,
                    "gl": gl,
                    "hl": hl,
                    "api_key": key,
                }
                if next_token:
                    params["next_page_token"] = next_token
                try:
                    with requests.get(
                        SERPAPI_ENDPOINT, params=params, timeout=self.request_timeout
                    ) as response:
                        response.raise_for_status()
                        payload = response.json()
                except requests.RequestException:
                    # Never chain/include the exception — params embed api_key.
                    raise RuntimeError(
                        "SerpApi Google Jobs request failed "
                        "(network or HTTP error; API key redacted)"
                    ) from None
                if payload.get("error"):
                    scraper_log(f"\t\tSerpApi error: {payload.get('error')}")
                    break
                batch = payload.get("jobs_results") or []
                weeks = get_within_weeks()
                for job in batch:
                    if fetched >= fetch_budget or len(by_key) >= limit:
                        break
                    fetched += 1
                    if not isinstance(job, dict):
                        continue
                    if not self._serpapi_record_is_recent(job, weeks=weeks):
                        continue
                    dedupe = str(job.get("job_id") or job.get("share_link") or "")
                    if not dedupe:
                        dedupe = (
                            f"{job.get('title')}|{job.get('company_name')}|"
                            f"{job.get('location')}"
                        )
                    by_key.setdefault(dedupe, job)
                next_token = (payload.get("serpapi_pagination") or {}).get("next_page_token")
                if not next_token or not batch:
                    break
                scraper_log(f"\t\tpage {page + 1}: +{len(batch)} (unique={len(by_key)})")
        return list(by_key.values())[:limit]

    def _serpapi_record_is_recent(self, job: dict[str, Any], *, weeks: int) -> bool:
        """True when the listing has no posted_at signal or it passes the cutoff."""
        from utils.date_utils import is_recent_job

        detected = job.get("detected_extensions") or {}
        posted = detected.get("posted_at") if isinstance(detected, dict) else None
        if not posted:
            extensions = job.get("extensions")
            if isinstance(extensions, (list, tuple)):
                for ext in extensions:
                    if isinstance(ext, str) and re.search(
                        r"\b(ago|day|hour|week|month)\b", ext, re.I
                    ):
                        posted = ext
                        break
        if not posted:
            return True
        return is_recent_job(str(posted), weeks=weeks, lang=self.language or "en")

    def _prepare_date_posted(
        self, fields: dict[str, Any], *, now=None
    ) -> None:
        """Resolve SerpApi relative strings to a full timestamp before recency.

        Keep the time component so ``is_recent_job``'s inclusive cutoff is not
        undermined by date-only truncation; ``normalize_date`` shortens to
        ``YYYY-MM-DD`` only after the job is accepted. ``now`` must match the
        clock passed to ``is_recent_job`` for boundary stability.
        """
        date_str = fields.get("date_posted")
        if not date_str:
            return
        relative = parse_relative_posted_at(str(date_str), now=now)
        if relative is not None:
            fields["date_posted"] = relative.isoformat()

    def parse_job(self, record: dict[str, Any]) -> dict[str, Any] | None:
        """Map one SerpApi Google Jobs result to Wev fields. Return None to skip."""
        title = (record.get("title") or record.get("job_title") or "").strip()
        organization = (record.get("company_name") or "").strip()
        listing_url = self._best_apply_url(record)
        if not title or not organization or not listing_url:
            return None

        description = record.get("description") or ""
        if not isinstance(description, str):
            description = str(description)

        location = (record.get("location") or "").strip() or None
        municipality, province = self._split_location(location)
        extensions = record.get("extensions") or []
        detected = record.get("detected_extensions") or {}
        if not isinstance(detected, dict):
            detected = {}

        if not isinstance(extensions, (list, tuple)):
            extensions = []

        wage = detected.get("salary")
        if not wage:
            for ext in extensions:
                if not isinstance(ext, str):
                    continue
                # Exclude posting-age strings ("3 hours ago") that mention hour/day.
                if re.search(r"\bago\b", ext, re.I):
                    continue
                lower = ext.lower()
                if "$" in ext or "salary" in lower or re.search(
                    r"\b(?:per\s+)?(?:hour|year|annum|month|week)\b", lower
                ):
                    wage = ext
                    break

        employment = detected.get("schedule_type")
        if not employment:
            for ext in extensions:
                if isinstance(ext, str) and ext.lower() in {
                    "full-time",
                    "part-time",
                    "contractor",
                    "temporary",
                    "internship",
                    "full time",
                    "part time",
                }:
                    employment = ext
                    break

        posted = detected.get("posted_at")
        if not posted:
            for ext in extensions:
                if isinstance(ext, str) and re.search(r"\b(ago|day|hour|week|month)\b", ext, re.I):
                    posted = ext
                    break

        is_remote = bool(detected.get("work_from_home")) or (
            bool(location) and location.lower() in {"anywhere", "remote", "canada (remote)"}
        )

        fields: dict[str, Any] = {
            "job_title": title,
            "organization": organization,
            "listing_url": listing_url,
            "description": description,
            "location": location,
            "municipality": municipality,
            "province": province,
            "wage": wage,
            "employment_type": self._employment_type(employment),
            "date_posted": posted,
            "_via": record.get("via"),
            "_source_job_id": record.get("job_id"),
        }
        # Only set workplace when SerpApi signals remote; otherwise leave unset
        # so location inference can classify onsite/hybrid.
        if is_remote:
            fields["is_remote"] = True
            fields["work_type"] = "remote"
        return fields

    def _best_apply_url(self, record: dict[str, Any]) -> str | None:
        """Prefer the first concrete apply_options link, else share_link."""
        for opt in record.get("apply_options") or []:
            if not isinstance(opt, dict):
                continue
            link = (opt.get("link") or "").strip()
            if link and "google.com/search" not in link:
                return link
        for key in ("share_link", "source_link"):
            link = (record.get(key) or "").strip()
            if link:
                return link
        return None

    def _split_location(self, location: str | None) -> tuple[str | None, str | None]:
        """Split Google Jobs location into (municipality, province).

        ``Toronto, ON, Canada`` → (Toronto, ON).
        ``Toronto, Canada`` → (Toronto, None) — country is not a province.
        """
        if not location or location.strip().lower() in {"canada", "anywhere"}:
            return None, None
        parts = [p.strip() for p in location.split(",") if p.strip()]
        if not parts:
            return None, None
        if len(parts) == 1:
            return parts[0], None
        # Drop trailing country label so it never becomes municipality/province.
        if parts[-1].lower() == "canada":
            parts = parts[:-1]
        if not parts:
            return None, None
        if len(parts) == 1:
            return parts[0], None
        return parts[0], parts[1]

    def _employment_type(self, raw: str | None) -> str | None:
        """Normalize SerpApi employment schedule strings to Wev tokens."""
        if not raw:
            return None
        text = raw.strip().lower().replace("_", " ")
        mapping = {
            "full-time": "full-time",
            "full time": "full-time",
            "part-time": "part-time",
            "part time": "part-time",
            "contractor": "contract",
            "contract": "contract",
            "temporary": "temporary",
            "internship": "internship",
            "volunteer": "volunteer",
        }
        return mapping.get(text, text.replace(" ", "-"))
