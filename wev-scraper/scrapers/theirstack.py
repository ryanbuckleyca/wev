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

import os
from typing import Any

import requests

from scrapers.base_api import BaseApiScraper
from utils.date_utils import get_within_weeks
from utils.env import get_int_env
from utils.log import scraper_log

THEIRSTACK_ENDPOINT = "https://api.theirstack.com/v1/jobs/search"

DEFAULT_DOMAIN_OR = "indeed.com,ca.indeed.com,linkedin.com"
DEFAULT_DOMAIN_NOT = (
    "greenhouse.io,lever.co,myworkdayjobs.com,workdayjobs.com,ashbyhq.com,"
    "bamboohr.com,icims.com,smartrecruiters.com,dayforcehcm.com,jobvite.com,"
    "workable.com,recruitee.com,applytojob.com"
)


class TheirStackScraper(BaseApiScraper):
    """Canada TheirStack jobs limited to Indeed/LinkedIn (gap-fill)."""

    language = "en"
    request_timeout = 90
    _PAGE_SIZE_CAP = 100
    sample_path_envs = ("THEIRSTACK_SAMPLE_PATH",)
    auto_detect_employment_type = False

    def get_api_key(self) -> str:
        """Return the TheirStack API key or raise when unset."""
        key = (os.environ.get("THEIRSTACK_API_KEY") or "").strip()
        if not key:
            raise RuntimeError("THEIRSTACK_API_KEY is required")
        return key

    def build_search_body(
        self,
        limit: int,
        page: int | None = None,
        *,
        offset: int | None = None,
    ) -> dict[str, Any]:
        """Build a Canada Indeed/LinkedIn search body (page or offset paging)."""
        country = (os.environ.get("THEIRSTACK_COUNTRY") or "CA").strip() or "CA"
        max_age = get_int_env("THEIRSTACK_POSTED_AT_MAX_AGE_DAYS")
        if max_age is None:
            weeks = get_within_weeks()
            max_age = max(1, int(weeks) * 7) if weeks else 14

        override_or = os.environ.get("THEIRSTACK_URL_DOMAIN_OR")
        if override_or is None:
            domain_or = [d.strip() for d in DEFAULT_DOMAIN_OR.split(",") if d.strip()]
        else:
            domain_or = [d.strip() for d in override_or.split(",") if d.strip()]
            if not domain_or:
                domain_or = [
                    d.strip() for d in DEFAULT_DOMAIN_OR.split(",") if d.strip()
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
            "limit": min(max(1, limit), self._PAGE_SIZE_CAP),
            "url_domain_or": domain_or,
        }
        if offset is not None:
            body["offset"] = max(0, offset)
        else:
            body["page"] = 0 if page is None else page
        if domain_not:
            body["url_domain_not"] = domain_not
        return body

    def fetch_jobs(self) -> list[dict[str, Any]]:
        """Fetch Canada Indeed/LinkedIn jobs (live API or offline sample)."""
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
        """Page TheirStack with offset paging; never request more rows than ``limit``."""
        key = self.get_api_key()
        limit = self._max_jobs or get_int_env("THEIRSTACK_MAX_ITEMS") or 50
        page_size = min(limit, self._PAGE_SIZE_CAP)
        collected: list[dict[str, Any]] = []
        while len(collected) < limit:
            need = min(page_size, limit - len(collected))
            body = self.build_search_body(need, offset=len(collected))
            scraper_log(
                f"\tTheirStack search CA offset={body.get('offset')} "
                f"limit={body.get('limit')} "
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

            batch = payload.get("data")
            if batch is None or batch == []:
                break
            if not isinstance(batch, list):
                raise RuntimeError(
                    "TheirStack search `data` must be a list, "
                    f"got {type(batch).__name__}"
                )
            dict_rows = [j for j in batch if isinstance(j, dict)]
            # Full page with no objects would otherwise re-request the same offset.
            if not dict_rows:
                raise RuntimeError(
                    "TheirStack search page contained no object entries "
                    f"(batch_len={len(batch)}, offset={body.get('offset')})"
                )
            collected.extend(dict_rows)
            if len(batch) < need:
                break
        return collected[:limit]

    def parse_job(self, record: dict[str, Any]) -> dict[str, Any] | None:
        """Map one TheirStack job record to Wev fields. Return None to skip."""
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

        fields: dict[str, Any] = {
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
            "_source_job_id": record.get("id"),
            "_source_url": record.get("source_url"),
        }
        # Explicit true/false flags classify; both null/missing leave inference.
        remote_val = record.get("remote") if "remote" in record else None
        hybrid_val = record.get("hybrid") if "hybrid" in record else None
        if remote_val is True:
            fields["is_remote"] = True
            fields["work_type"] = "remote"
        elif hybrid_val is True:
            fields["is_remote"] = False
            fields["work_type"] = "hybrid"
        elif remote_val is False or hybrid_val is False:
            fields["is_remote"] = False
            fields["work_type"] = "onsite"
        return fields

