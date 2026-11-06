"""Tests for Apify Canada Job Bank scraper field mapping."""

from __future__ import annotations

import json
from unittest.mock import patch

from scrapers.apify import ApifyJobBankScraper, _actor_path


def _scraper() -> ApifyJobBankScraper:
    return ApifyJobBankScraper(
        {
            "id": "t",
            "name": "Apify (Canada Job Bank)",
            "url": "https://api.apify.com/v2/acts/getascraper~jobbank-scraper",
            "slug": "apify",
        }
    )


def _sample_record(**overrides):
    record = {
        "title": "counsellor, job",
        "employer": "SkyPod Immigration Consulting Inc.",
        "url": "https://www.jobbank.gc.ca/jobsearch/jobposting/12345",
        "city": "Scarborough",
        "province": "ON",
        "employment_type": "full-time",
        "salary_min": 19,
        "salary_max": 20,
        "salary_currency": "CAD",
        "salary_unit": "hour",
        "description": "Admission Counsellor supports international students.",
        "application_url": "https://ca.indeed.com/viewjob?jk=abc",
        "date_posted": "2026-10-01",
    }
    record.update(overrides)
    return record


def test_actor_path_slash_to_tilde():
    assert _actor_path("getascraper/jobbank-scraper") == "getascraper~jobbank-scraper"
    assert _actor_path("getascraper~jobbank-scraper") == "getascraper~jobbank-scraper"


def test_parse_job_maps_getascraper_fields():
    fields = _scraper().parse_job(_sample_record())
    assert fields is not None
    assert fields["job_title"] == "counsellor, job"
    assert fields["organization"] == "SkyPod Immigration Consulting Inc."
    assert fields["listing_url"].startswith("https://www.jobbank.gc.ca/")
    assert fields["municipality"] == "Scarborough"
    assert fields["province"] == "ON"
    assert fields["employment_type"] == "full-time"
    assert fields["wage"] == "$19 - $20 CAD hour"
    assert "Admission Counsellor" in fields["description"]
    assert fields["_apply_url"] and "indeed.com" in fields["_apply_url"]


def test_fetch_jobs_from_sample(monkeypatch, tmp_path):
    sample = tmp_path / "apify-jobbank.json"
    sample.write_text(
        json.dumps(
            [
                _sample_record(),
                _sample_record(
                    title="Second role",
                    url="https://www.jobbank.gc.ca/jobsearch/jobposting/999",
                ),
                _sample_record(
                    title="Third role",
                    url="https://www.jobbank.gc.ca/jobsearch/jobposting/1000",
                ),
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("APIFY_JOBBANK_SAMPLE_PATH", str(sample))
    monkeypatch.setenv("WITHIN_WEEKS", "9999")
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    monkeypatch.delenv("MAX_JOBS_PER_SOURCE", raising=False)
    jobs = _scraper().fetch_jobs()
    assert len(jobs) == 3
    assert all(j.get("job_title") for j in jobs)
    assert all(j.get("listing_url") for j in jobs)
    assert all(isinstance((j.get("extra") or {}).get("source_dump"), dict) for j in jobs)
    assert jobs[0]["extra"]["source_dump"].get("employer") == (
        "SkyPod Immigration Consulting Inc."
    )


def test_parse_job_requires_core_fields():
    assert _scraper().parse_job({"title": "x", "employer": "y"}) is None


class _JsonResp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_apify_requests_use_bearer_header_not_query_token(monkeypatch):
    monkeypatch.setenv("APIFY_API_TOKEN", "apify_api_SECRET")
    monkeypatch.delenv("APIFY_JOBBANK_SAMPLE_PATH", raising=False)
    monkeypatch.delenv("JOBBANK_SAMPLE_PATH", raising=False)
    monkeypatch.setenv("APIFY_JOBBANK_WAIT_SECS", "1")
    monkeypatch.setenv("WITHIN_WEEKS", "9999")
    monkeypatch.setenv("SHOULD_GEOCODE", "0")

    run_resp = _JsonResp(
        {
            "data": {
                "status": "SUCCEEDED",
                "id": "run-1",
                "defaultDatasetId": "ds-1",
            }
        }
    )
    items_resp = _JsonResp([_sample_record()])

    with (
        patch("scrapers.apify.time.sleep"),
        patch(
            "scrapers.apify.requests.post", return_value=run_resp
        ) as mock_post,
        patch(
            "scrapers.apify.requests.get", return_value=items_resp
        ) as mock_get,
    ):
        jobs = _scraper().fetch_jobs()

    assert len(jobs) == 1
    post_url = mock_post.call_args.args[0]
    get_url = mock_get.call_args.args[0]
    assert "token=" not in post_url
    assert "token=" not in get_url
    assert mock_post.call_args.kwargs["headers"]["Authorization"] == (
        "Bearer apify_api_SECRET"
    )
    assert mock_get.call_args.kwargs["headers"]["Authorization"] == (
        "Bearer apify_api_SECRET"
    )
