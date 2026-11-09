"""Apify actor ``getascraper/jobbank-scraper`` — Canada Job Bank inventory.

Runs the actor with bearer ``APIFY_API_TOKEN``, maps posting records into the
same Wev job fields as other scrapers, then normalizes.

Offline testing: set ``APIFY_JOBBANK_SAMPLE_PATH`` (or ``JOBBANK_SAMPLE_PATH``)
to a JSON array (or ``{data:[...]}``) of getascraper records — no Apify call.

Listings originate on jobbank.gc.ca; prefer that ``url`` as ``listing_url``.
``application_url`` is kept when present for apply routing later.
"""

from __future__ import annotations

import os
import time
from datetime import datetime
from typing import Any

import requests

from scrapers.base_api import BaseApiScraper
from utils.date_utils import get_within_weeks
from utils.env import get_int_env
from utils.log import scraper_log

DEFAULT_ACTOR_ID = "getascraper/jobbank-scraper"
APIFY_API_BASE = "https://api.apify.com/v2"
# Apify caps waitForFinish at 60s per request; longer waits poll the run.
_API_WAIT_FOR_FINISH_MAX = 60
DEFAULT_WAIT_SECS = 300
_TERMINAL_RUN_STATUSES = frozenset({"SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"})


def _actor_path(actor_id: str) -> str:
    """Apify URL path uses ``user~name``; accept ``user/name`` in env."""
    return actor_id.strip().replace("/", "~")


class ApifyJobBankScraper(BaseApiScraper):
    """Apify scraper for Canada Job Bank (getascraper/jobbank-scraper actor)."""

    language = "en"
    request_timeout = 60
    sample_path_envs = ("APIFY_JOBBANK_SAMPLE_PATH", "JOBBANK_SAMPLE_PATH")
    sample_list_keys = ("data", "items", "jobs")

    def get_actor_id(self) -> str:
        """Return the Apify actor id (env override or default Job Bank actor)."""
        return (
            os.environ.get("APIFY_JOBBANK_ACTOR") or DEFAULT_ACTOR_ID
        ).strip() or DEFAULT_ACTOR_ID

    def get_token(self) -> str:
        """Return the Apify API token or raise when unset."""
        token = (os.environ.get("APIFY_API_TOKEN") or "").strip()
        if not token:
            raise RuntimeError("APIFY_API_TOKEN is required for Apify Job Bank scrape")
        return token

    def _auth_headers(self, *, json_body: bool = False) -> dict[str, str]:
        """Bearer auth — prefer header over ``?token=`` so secrets stay out of URLs."""
        headers = {
            "Authorization": f"Bearer {self.get_token()}",
            "Accept": "application/json",
        }
        if json_body:
            headers["Content-Type"] = "application/json"
        return headers

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
        """Fetch Canada Job Bank jobs via Apify actor or offline sample."""
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

        for index, record in enumerate(records):
            if self._at_job_limit():
                break
            if not isinstance(record, dict):
                continue
            job_dict, _ = self._process_record(record, index, weeks=weeks)
            if job_dict:
                self.jobs.append(job_dict)

        return self.jobs

    def _run_actor(self, limit: int) -> list[dict[str, Any]]:
        """Start the Job Bank actor run, wait for terminal status, fetch dataset."""
        actor = _actor_path(self.get_actor_id())
        total_wait = get_int_env("APIFY_JOBBANK_WAIT_SECS") or DEFAULT_WAIT_SECS
        actor_input = self.build_actor_input(limit)
        scraper_log(
            f"\tStarting Apify actor {self.get_actor_id()} "
            f"(maxItems={actor_input.get('maxItems')}, "
            f"keyword={actor_input.get('searchKeyword')!r}, "
            f"location={actor_input.get('location')!r})"
        )
        run = self._start_actor_run(actor, actor_input)
        run = self._wait_for_run_terminal(run, total_wait_secs=total_wait)
        status = run.get("status")
        dataset_id = run.get("defaultDatasetId")
        if status not in _TERMINAL_RUN_STATUSES:
            # Wait budget expired while still RUNNING/READY — stop the actor
            # so it does not keep consuming Apify compute units.
            run_id = run.get("id")
            if run_id:
                self._abort_run(str(run_id))
            raise RuntimeError(
                f"Apify Job Bank run did not finish in time: status={status} "
                f"id={run_id} message={run.get('statusMessage')}"
            )
        if status != "SUCCEEDED":
            raise RuntimeError(
                f"Apify Job Bank run did not succeed: status={status} "
                f"id={run.get('id')} message={run.get('statusMessage')}"
            )
        if not dataset_id:
            raise RuntimeError("Apify Job Bank run missing defaultDatasetId")

        return self._fetch_dataset_items(dataset_id)

    def _start_actor_run(
        self, actor: str, actor_input: dict[str, Any]
    ) -> dict[str, Any]:
        """POST a new actor run and return its run object.

        Uses ``waitForFinish=0`` so acceptance returns quickly with a run id.
        On uncertain transport failures (timeout / connection drop after the
        request may have been accepted), reconcile against recent actor runs
        before raising — callers must not blindly retry a duplicate start.
        HTTP error responses mean the run was not accepted and remain safe to
        surface for a later retry.
        """
        # Accept immediately; polling happens in ``_wait_for_run_terminal``.
        run_url = f"{APIFY_API_BASE}/acts/{actor}/runs?waitForFinish=0"
        try:
            with requests.post(
                run_url,
                json=actor_input,
                headers=self._auth_headers(json_body=True),
                timeout=self.request_timeout,
            ) as response:
                response.raise_for_status()
                run = response.json().get("data") or {}
                if not run.get("id"):
                    raise RuntimeError("Apify Job Bank start response missing run id")
                return run
        except requests.HTTPError as e:
            # Server responded — start was rejected; safe for orchestrator retry.
            raise RuntimeError(f"Failed to start Apify Job Bank run: {e}") from e
        except (requests.Timeout, requests.ConnectionError) as e:
            recovered = self._recover_recent_run(actor)
            if recovered:
                scraper_log(
                    f"\tRecovered Apify run {recovered.get('id')} after uncertain "
                    f"start ({type(e).__name__})"
                )
                return recovered
            raise RuntimeError(
                f"Failed to start Apify Job Bank run (uncertain; no recent run "
                f"found to recover): {e}"
            ) from e
        except requests.RequestException as e:
            raise RuntimeError(f"Failed to start Apify Job Bank run: {e}") from e

    def _recover_recent_run(self, actor: str) -> dict[str, Any] | None:
        """Return a very recent actor run if one likely belongs to a timed-out start."""
        list_url = f"{APIFY_API_BASE}/acts/{actor}/runs?limit=5&desc=1"
        try:
            with requests.get(
                list_url,
                headers=self._auth_headers(),
                timeout=self.request_timeout,
            ) as response:
                response.raise_for_status()
                payload = response.json()
        except requests.RequestException as e:
            scraper_log(f"\tWarning: could not list Apify runs for recovery: {e}")
            return None

        items = payload.get("data", {}).get("items")
        if not isinstance(items, list):
            items = payload.get("data") if isinstance(payload.get("data"), list) else []
        # Only adopt a run started within the last two minutes.
        cutoff = time.time() - 120
        for item in items:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            started = item.get("startedAt") or item.get("started_at")
            if not isinstance(started, str):
                continue
            try:
                # Apify returns ISO-8601 UTC timestamps.
                started_dt = datetime.fromisoformat(started.replace("Z", "+00:00"))
                if started_dt.timestamp() < cutoff:
                    continue
            except ValueError:
                continue
            status = item.get("status")
            if status in _TERMINAL_RUN_STATUSES and status != "SUCCEEDED":
                continue
            return item
        return None

    def _abort_run(self, run_id: str) -> None:
        """Best-effort abort of a still-running Apify actor run."""
        abort_url = f"{APIFY_API_BASE}/actor-runs/{run_id}/abort"
        try:
            with requests.post(
                abort_url,
                headers=self._auth_headers(),
                timeout=self.request_timeout,
            ) as response:
                response.raise_for_status()
            scraper_log(f"\tAborted non-terminal Apify run {run_id}")
        except requests.RequestException as e:
            scraper_log(f"\tWarning: failed to abort Apify run {run_id}: {e}")

    def _wait_for_run_terminal(
        self, run: dict[str, Any], *, total_wait_secs: int
    ) -> dict[str, Any]:
        """Poll until the actor run reaches a terminal status or the wait budget expires."""
        status = run.get("status")
        if status in _TERMINAL_RUN_STATUSES:
            return run
        run_id = run.get("id")
        if not run_id:
            return run

        deadline = time.monotonic() + max(0, total_wait_secs)
        while time.monotonic() < deadline:
            remaining = max(0, int(deadline - time.monotonic()))
            wait_param = min(remaining, _API_WAIT_FOR_FINISH_MAX)
            if wait_param <= 0:
                break
            poll_url = (
                f"{APIFY_API_BASE}/actor-runs/{run_id}?waitForFinish={wait_param}"
            )
            try:
                with requests.get(
                    poll_url,
                    headers=self._auth_headers(),
                    timeout=wait_param + self.request_timeout,
                ) as response:
                    response.raise_for_status()
                    run = response.json().get("data") or run
            except requests.RequestException as e:
                raise RuntimeError(
                    f"Failed to poll Apify Job Bank run {run_id}: {e}"
                ) from e
            status = run.get("status")
            if status in _TERMINAL_RUN_STATUSES:
                return run
        return run

    def _fetch_dataset_items(self, dataset_id: str) -> list[dict[str, Any]]:
        """Download all items from an Apify dataset via offset paging."""
        items: list[dict[str, Any]] = []
        offset = 0
        page_size = 250
        headers = self._auth_headers()
        while True:
            url = (
                f"{APIFY_API_BASE}/datasets/{dataset_id}/items"
                f"?format=json&clean=1&offset={offset}&limit={page_size}"
            )
            try:
                with requests.get(
                    url, headers=headers, timeout=self.request_timeout
                ) as response:
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

        website = (record.get("employer_website") or "").strip() or None
        apply_url = (record.get("application_url") or "").strip() or None

        fields: dict[str, Any] = {
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
            "_apply_url": apply_url,
            "_noc_code": record.get("noc_code"),
            "_source_job_id": record.get("internal_id") or record.get("job_id"),
            "_stable_id": record.get("stable_id"),
        }
        workplace_raw = record.get("workplace_type") or record.get("work_type")
        if isinstance(workplace_raw, str) and workplace_raw.strip():
            workplace = workplace_raw.lower()
            if "remote" in workplace or "telework" in workplace:
                fields["is_remote"] = True
                fields["work_type"] = "remote"
            elif "hybrid" in workplace:
                fields["is_remote"] = False
                fields["work_type"] = "hybrid"
            else:
                fields["is_remote"] = False
                fields["work_type"] = "onsite"
        return fields

    def _format_wage(self, record: dict[str, Any]) -> str | None:
        """Format Job Bank salary fields into a display wage string."""
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
        """Normalize Job Bank employment_type text to Wev tokens."""
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
        """Return the first present Job Bank posted-date field as a string."""
        for key in ("date_posted", "posted_date", "date_posted_raw"):
            value = record.get(key)
            if value:
                return str(value).strip()
        return None
