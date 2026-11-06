"""The Jobs API — Canada ATS / employer career pages (cost waterfall tier 3).

Complements cheaper Google Jobs + Job Bank coverage with structured ATS
postings (Workday, Greenhouse, Dayforce, iCIMS, …). Not for Indeed/LinkedIn —
those are TheirStack's lane.

Recency is requested via the ``window`` query param (not client-side chronology).
Default window maps from ``WITHIN_WEEKS`` (2 weeks → ``30d``), overridable with
``TJA_WINDOW`` / ``TJA_TIME_FRAME``.

Env:
  TJA_API_KEY or THEJOBSAPI_KEY
  TJA_COUNTRY (default CA)
  TJA_SOURCES — optional comma ATS allowlist (e.g. workday,greenhouse)
  TJA_WINDOW / TJA_TIME_FRAME — 1h | 24h | 7d | 30d | 6m
  TJA_SAMPLE_PATH — offline JSON array of detail records
"""

from __future__ import annotations

import os
import time
from typing import Any

import requests

from scrapers.base_api import BaseApiScraper
from utils.date_utils import get_within_weeks
from utils.env import get_int_env
from utils.log import scraper_log

TJA_BASE = "https://api.thejobsapi.com"
# Documented /v1/jobs window values (first-collected window).
_VALID_WINDOWS = frozenset({"1h", "24h", "7d", "30d", "6m"})


def window_for_within_weeks(weeks: int) -> str:
    """Map WITHIN_WEEKS to the nearest TJA ``window`` that covers it."""
    if weeks <= 0:
        return "7d"
    if weeks <= 1:
        return "7d"
    if weeks <= 4:
        return "30d"
    return "6m"


class TheJobsApiScraper(BaseApiScraper):
    """Canada ATS jobs from The Jobs API."""

    # /v1/jobs is newest-first, but pages can be sparse under search; do not
    # early-break on an outdated row — ``window`` already bounds the request.
    language = "en"
    request_timeout = 60
    sample_path_envs = ("TJA_SAMPLE_PATH",)
    auto_detect_employment_type = False

    def get_api_key(self) -> str:
        """Return the The Jobs API key or raise when unset."""
        key = (
            os.environ.get("TJA_API_KEY") or os.environ.get("THEJOBSAPI_KEY") or ""
        ).strip()
        if not key:
            raise RuntimeError("TJA_API_KEY (or THEJOBSAPI_KEY) is required")
        return key

    def _headers(self) -> dict[str, str]:
        """Bearer auth headers for TJA list/detail requests."""
        return {"Authorization": f"Bearer {self.get_api_key()}", "Accept": "application/json"}

    def resolve_window(self, weeks: int | None = None) -> str:
        """Env override, else map WITHIN_WEEKS → documented ``window`` value."""
        raw = (
            os.environ.get("TJA_WINDOW") or os.environ.get("TJA_TIME_FRAME") or ""
        ).strip()
        if raw:
            if raw not in _VALID_WINDOWS:
                raise RuntimeError(
                    f"Invalid TJA_WINDOW={raw!r}; expected one of "
                    f"{', '.join(sorted(_VALID_WINDOWS))}"
                )
            return raw
        return window_for_within_weeks(weeks if weeks is not None else get_within_weeks())

    def fetch_jobs(self) -> list[dict[str, Any]]:
        """Fetch Canada ATS jobs from The Jobs API (live or offline sample)."""
        sample_path = self.get_sample_path()
        if sample_path:
            details = self._load_sample_records(sample_path)
            scraper_log(f"\tTJA sample: {len(details)} from {sample_path}")
        else:
            details = self._fetch_canada_details()
            scraper_log(f"\tTJA returned {len(details)} CA detail jobs")

        self.total_listings_found = len(details)
        weeks = get_within_weeks()
        for index, detail in enumerate(details):
            if self._max_jobs and len(self.jobs) >= self._max_jobs:
                break
            if not isinstance(detail, dict):
                scraper_log(
                    f"\t\tSkipping job {index + 1}: detail is "
                    f"{type(detail).__name__}, expected dict"
                )
                continue
            country_raw = detail.get("country")
            if country_raw is None:
                country = ""
            elif isinstance(country_raw, str):
                country = country_raw.upper()
            else:
                scraper_log(
                    f"\t\tSkipping job {index + 1}: country is "
                    f"{type(country_raw).__name__}, expected string"
                )
                continue
            if country not in ("CA", "CANADA", ""):
                # Empty country allowed if locations say CA
                locs = detail.get("locations") or []
                if not isinstance(locs, list):
                    continue
                if not any(
                    isinstance(loc, dict)
                    and isinstance(loc.get("country"), str)
                    and loc.get("country", "").upper() == "CA"
                    for loc in locs
                ):
                    continue
            job_dict, _ = self._process_record(detail, index, weeks=weeks)
            if job_dict:
                self.jobs.append(job_dict)
        return self.jobs

    def _fetch_canada_details(self) -> list[dict[str, Any]]:
        """List Canada jobs via TJA cursor paging, then hydrate missing descriptions."""
        limit = self._max_jobs or get_int_env("TJA_MAX_ITEMS") or 50
        window = self.resolve_window()
        country = (os.environ.get("TJA_COUNTRY") or "CA").strip() or "CA"
        sources = (os.environ.get("TJA_SOURCES") or "").strip()

        collected: list[dict[str, Any]] = []
        cursor: str | None = None
        page = 0
        while len(collected) < limit:
            page_size = min(limit - len(collected), 100)
            params: dict[str, Any] = {
                "country": country,
                "limit": page_size,
                # First-collected window (e.g. 7d / 30d). Client still applies
                # WITHIN_WEEKS on date_posted as a second filter.
                "window": window,
                # Prefer full text on the list so we can skip per-id detail calls.
                "description": "text",
            }
            if sources:
                params["source"] = sources
            if cursor:
                params["cursor"] = cursor

            scraper_log(
                f"\tTJA list country={country} window={window} "
                f"page={page} limit={page_size}"
                + (f" cursor={cursor!r}" if cursor else "")
            )
            try:
                with requests.get(
                    f"{TJA_BASE}/v1/jobs",
                    params=params,
                    headers=self._headers(),
                    timeout=self.request_timeout,
                ) as response:
                    response.raise_for_status()
                    payload = response.json()
            except requests.RequestException as e:
                raise RuntimeError(f"TJA list failed: {e}") from e

            batch = payload.get("jobs") or payload.get("data") or []
            if not isinstance(batch, list):
                raise RuntimeError("TJA list response jobs was not an array")
            for job in batch:
                if not isinstance(job, dict):
                    continue
                collected.append(job)
                if len(collected) >= limit:
                    break

            next_cursor = payload.get("next_cursor")
            if not next_cursor or not batch:
                break
            # Docs: sparse pages can return fewer than limit while next_cursor
            # is still set — keep paging until the cursor clears or we hit cap.
            cursor = str(next_cursor)
            page += 1
            time.sleep(0.2)

        return self._ensure_job_details(collected[:limit])

    def _ensure_job_details(self, jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Hydrate list rows that lack a description via GET /v1/jobs/{id}."""
        max_attempts = 3
        details: list[dict[str, Any]] = []
        for i, job in enumerate(jobs, 1):
            if job.get("description_text") or job.get("description"):
                details.append(job)
                continue
            jid = job.get("id")
            if jid is None:
                continue
            detail = None
            for attempt in range(1, max_attempts + 1):
                try:
                    with requests.get(
                        f"{TJA_BASE}/v1/jobs/{jid}",
                        headers=self._headers(),
                        timeout=self.request_timeout,
                    ) as response:
                        response.raise_for_status()
                        detail = response.json()
                    break
                except requests.RequestException as e:
                    if attempt >= max_attempts:
                        scraper_log(
                            f"\t\tTJA detail {jid} failed after {max_attempts} "
                            f"attempts: {e}"
                        )
                    else:
                        time.sleep(0.4 * attempt)
            if isinstance(detail, dict):
                details.append(detail)
            if i % 10 == 0:
                time.sleep(0.2)
        return details

    def parse_job(self, detail: dict[str, Any]) -> dict[str, Any] | None:
        """Map one TJA job detail to Wev fields. Return None to skip."""
        title = (detail.get("title") or "").strip()
        organization = (detail.get("organization") or "").strip()
        listing_url = (
            (detail.get("url") or detail.get("apply_url") or "").strip() or None
        )
        if not title or not organization or not listing_url:
            return None

        loc0 = (detail.get("locations") or [None])[0] or {}
        if not isinstance(loc0, dict):
            loc0 = {}
        location = loc0.get("label")
        if not location:
            parts = [p for p in (loc0.get("city"), loc0.get("province"), loc0.get("country")) if p]
            location = ", ".join(parts) if parts else None

        description = detail.get("description_text") or detail.get("description") or ""
        if not isinstance(description, str):
            description = str(description)

        salary = detail.get("salary") if isinstance(detail.get("salary"), dict) else None
        wage = None
        if salary:
            if salary.get("text"):
                wage = str(salary["text"]).strip()
            else:
                mn, mx = salary.get("min"), salary.get("max")
                currency = (salary.get("currency") or "").upper()
                period = (salary.get("period") or "").lower()
                if mn is not None or mx is not None:
                    if mn is not None and mx is not None and mn != mx:
                        amount = f"${mn} - ${mx}"
                    else:
                        amount = f"${mn if mn is not None else mx}"
                    wage = " ".join(p for p in (amount, currency, period) if p)

        types = detail.get("employment_types") or []
        employment = None
        if types:
            raw = str(types[0]).lower().replace("_", "-")
            employment = {
                "full-time": "full-time",
                "part-time": "part-time",
                "contract": "contract",
                "temporary": "temporary",
                "internship": "internship",
                "volunteer": "volunteer",
            }.get(raw, raw)

        remote = bool(detail.get("remote"))
        return {
            "job_title": title,
            "organization": organization,
            "listing_url": listing_url,
            "description": description,
            "location": location,
            "municipality": loc0.get("city"),
            "province": loc0.get("province"),
            "lat": loc0.get("latitude"),
            "lng": loc0.get("longitude"),
            "wage": wage,
            "employment_type": employment,
            "date_posted": detail.get("posted_at")
            or detail.get("date_posted")
            or detail.get("first_seen_at"),
            "is_remote": remote,
            "work_type": "remote" if remote else (detail.get("work_arrangement") or "onsite"),
            "_source_job_id": detail.get("id"),
            "_ats": detail.get("source") or detail.get("board"),
        }


