"""TheirStack — Canada Indeed / LinkedIn gap-fill (cost waterfall tier 4).

Only pulls boards that cheaper tiers (Google Jobs, Job Bank, TJA ATS) cover
poorly. Default ``url_domain_or`` is indeed.com + linkedin.com; ATS hosts are
denylisted so we do not re-buy Greenhouse/Workday credits.

Env:
  THEIRSTACK_API_KEY
  THEIRSTACK_COUNTRY (default CA)
  THEIRSTACK_URL_DOMAIN_OR — comma hosts to include (default indeed.com,linkedin.com)
  THEIRSTACK_URL_DOMAIN_NOT — comma hosts to exclude (default ATS list)
  THEIRSTACK_POSTED_AT_MAX_AGE_DAYS (default from WITHIN_WEEKS * 7 or 14)
  THEIRSTACK_SAMPLE_PATH
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import requests

from utils.date_utils import _parse_localized_date, get_within_weeks, is_recent_job
from utils.env import get_int_env
from utils.log import scraper_log
from utils.normalize import normalize_job_data
from utils.url import normalize_listing_url

THEIRSTACK_ENDPOINT = "https://api.theirstack.com/v1/jobs/search"

DEFAULT_DOMAIN_OR = "indeed.com,ca.indeed.com,linkedin.com"
DEFAULT_DOMAIN_NOT = (
    "greenhouse.io,lever.co,myworkdayjobs.com,workdayjobs.com,ashbyhq.com,"
    "bamboohr.com,icims.com,smartrecruiters.com,dayforcehcm.com,jobvite.com,"
    "workable.com,recruitee.com,applytojob.com"
)


class TheirStackScraper:
    """Canada TheirStack jobs limited to Indeed/LinkedIn (gap-fill)."""

    is_chronological = False
    language = "en"
    request_timeout = 90

    def __init__(self, source: dict[str, Any]):
        self.source = source
        self.existing_urls: set[str] = set()
        self.skipped_duplicates = 0
        self.total_listings_found = 0
        self.scraped_urls: set[str] = set()
        self.jobs: list[dict[str, Any]] = []
        self._max_jobs = get_int_env("MAX_JOBS_PER_SOURCE")

    def get_sample_path(self) -> str | None:
        return (os.environ.get("THEIRSTACK_SAMPLE_PATH") or "").strip() or None

    def get_api_key(self) -> str:
        key = (os.environ.get("THEIRSTACK_API_KEY") or "").strip()
        if not key:
            raise RuntimeError("THEIRSTACK_API_KEY is required")
        return key

    def build_search_body(self, limit: int, page: int = 0) -> dict[str, Any]:
        country = (os.environ.get("THEIRSTACK_COUNTRY") or "CA").strip() or "CA"
        max_age = get_int_env("THEIRSTACK_POSTED_AT_MAX_AGE_DAYS")
        if max_age is None:
            weeks = get_within_weeks()
            max_age = max(1, int(weeks) * 7) if weeks else 14

        domain_or = [
            d.strip()
            for d in (
                os.environ.get("THEIRSTACK_URL_DOMAIN_OR") or DEFAULT_DOMAIN_OR
            ).split(",")
            if d.strip()
        ]
        domain_not = [
            d.strip()
            for d in (
                os.environ.get("THEIRSTACK_URL_DOMAIN_NOT") or DEFAULT_DOMAIN_NOT
            ).split(",")
            if d.strip()
        ]

        body: dict[str, Any] = {
            "job_country_code_or": [country],
            "posted_at_max_age_days": max_age,
            "limit": min(limit, 100),
            "page": page,
        }
        if domain_or:
            body["url_domain_or"] = domain_or
        if domain_not:
            body["url_domain_not"] = domain_not
        return body

    def fetch_jobs(self) -> list[dict[str, Any]]:
        sample_path = self.get_sample_path()
        if sample_path:
            records = self._load_sample_records(sample_path)
            scraper_log(f"\tTheirStack sample: {len(records)} from {sample_path}")
        else:
            records = self._fetch_canada_jobs()
            scraper_log(f"\tTheirStack returned {len(records)} CA board jobs")

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
        key = self.get_api_key()
        limit = self._max_jobs or get_int_env("THEIRSTACK_MAX_ITEMS") or 50
        page_size = min(limit, 100)
        collected: list[dict[str, Any]] = []
        page = 0
        while len(collected) < limit:
            body = self.build_search_body(page_size, page=page)
            scraper_log(
                f"\tTheirStack search CA page={page} "
                f"domains_or={body.get('url_domain_or')} "
                f"max_age_days={body.get('posted_at_max_age_days')}"
            )
            try:
                with requests.post(
                    THEIRSTACK_ENDPOINT,
                    headers={
                        "Authorization": f"Bearer {key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                    timeout=self.request_timeout,
                ) as response:
                    response.raise_for_status()
                    payload = response.json()
            except requests.RequestException as e:
                raise RuntimeError(f"TheirStack search failed: {e}") from e

            batch = payload.get("data") or []
            if not batch:
                break
            collected.extend(j for j in batch if isinstance(j, dict))
            if len(batch) < page_size:
                break
            page += 1
        return collected[:limit]

    def _load_sample_records(self, sample_path: str) -> list[dict[str, Any]]:
        path = Path(sample_path).expanduser()
        if not path.is_file():
            raise RuntimeError(f"THEIRSTACK_SAMPLE_PATH not found: {path}")
        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload, list):
            return [r for r in payload if isinstance(r, dict)]
        if isinstance(payload, dict):
            records = payload.get("data") or payload.get("jobs") or []
            return [r for r in records if isinstance(r, dict)]
        raise RuntimeError(f"Unexpected TheirStack sample JSON: {path}")

    def parse_job(self, record: dict[str, Any]) -> dict[str, Any] | None:
        title = (record.get("job_title") or record.get("title") or "").strip()
        company_obj = record.get("company_object") or {}
        if not isinstance(company_obj, dict):
            company_obj = {}
        organization = (
            company_obj.get("name")
            or record.get("company")
            or record.get("company_name")
            or ""
        )
        if isinstance(organization, dict):
            organization = organization.get("name") or ""
        organization = str(organization).strip()

        listing_url = (
            record.get("final_url")
            or record.get("url")
            or record.get("source_url")
            or ""
        ).strip() or None
        if not title or not organization or not listing_url:
            return None

        description = record.get("description") or ""
        if not isinstance(description, str):
            description = str(description)

        location = record.get("location") or record.get("long_location") or record.get(
            "short_location"
        )
        municipality = None
        province = record.get("state_code")
        locs = record.get("locations") or []
        if locs and isinstance(locs[0], dict):
            municipality = locs[0].get("city") or locs[0].get("name")
            province = province or locs[0].get("state") or locs[0].get("province")
        cities = record.get("cities") or []
        if not municipality and cities:
            municipality = cities[0] if isinstance(cities[0], str) else None

        website = company_obj.get("domain") or record.get("company_domain")
        if website and not str(website).startswith("http"):
            website = f"https://{website}"

        wage = None
        if record.get("min_salary") is not None or record.get("max_salary") is not None:
            mn, mx = record.get("min_salary"), record.get("max_salary")
            currency = (record.get("salary_currency") or "").upper()
            period = (record.get("salary_period") or "").lower()
            if mn is not None and mx is not None and mn != mx:
                amount = f"${mn} - ${mx}"
            else:
                amount = f"${mn if mn is not None else mx}"
            wage = " ".join(p for p in (amount, currency, period) if p)
        elif record.get("salary_string"):
            wage = str(record.get("salary_string")).strip()

        statuses = record.get("employment_statuses") or []
        employment = None
        if statuses:
            raw = str(statuses[0]).lower().replace("_", "-")
            employment = {
                "full-time": "full-time",
                "part-time": "part-time",
                "contract": "contract",
                "temporary": "temporary",
                "internship": "internship",
            }.get(raw, raw)

        remote = bool(record.get("remote"))
        hybrid = bool(record.get("hybrid"))
        work_type = "remote" if remote else ("hybrid" if hybrid else "onsite")

        return {
            "job_title": title,
            "organization": organization,
            "listing_url": listing_url,
            "description": description,
            "location": location,
            "municipality": municipality,
            "province": province,
            "lat": record.get("latitude"),
            "lng": record.get("longitude"),
            "wage": wage,
            "employment_type": employment,
            "date_posted": record.get("date_posted"),
            "website": website,
            "is_remote": remote,
            "work_type": work_type,
            "_source_job_id": record.get("id"),
            "_source_url": record.get("source_url"),
        }

    def _process_record(
        self, record: dict[str, Any], index: int, *, weeks: int
    ) -> tuple[dict[str, Any] | None, bool]:
        fields = self.parse_job(record)
        if not fields:
            return None, False
        listing_url = fields.get("listing_url", "")
        norm_url = normalize_listing_url(listing_url)
        if not norm_url:
            return None, False
        if norm_url in self.existing_urls:
            self.skipped_duplicates += 1
            return None, False
        if norm_url in self.scraped_urls:
            return None, False
        self.scraped_urls.add(norm_url)

        date_str = fields.get("date_posted")
        title = fields.get("job_title", "Unknown")
        if date_str:
            if not is_recent_job(str(date_str), weeks=weeks, lang=self.language):
                scraper_log(f"\t\tSkipping outdated job {index + 1}: '{title}'")
                return None, False
            scraper_log(f"\t\tProcessing job {index + 1}: '{title}' posted {date_str}")
            try:
                dt = _parse_localized_date(str(date_str), lang=self.language)
                fields["date_posted"] = dt.isoformat()
            except Exception:
                pass
        else:
            scraper_log(f"\t\tProcessing job {index + 1}: '{title}'")

        fields["listing_url"] = norm_url
        job_dict = normalize_job_data(
            {
                "job_title": fields.get("job_title"),
                "date_posted": fields.get("date_posted"),
                "description": fields.get("description", ""),
                "organization": fields.get("organization"),
                "location": fields.get("location"),
                "municipality": fields.get("municipality"),
                "province": fields.get("province"),
                "lat": fields.get("lat"),
                "lng": fields.get("lng"),
                "listing_url": fields.get("listing_url"),
                "employment_type": fields.get("employment_type"),
                "wage": fields.get("wage"),
                "language": self.language,
                "website": fields.get("website"),
                "is_remote": fields.get("is_remote"),
                "work_type": fields.get("work_type"),
            }
        )
        return job_dict, False
