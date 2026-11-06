"""Tests for HeadcountLabsScraper — Headcount Labs JSON jobs API."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from scrapers.headcount import HeadcountLabsScraper


def make_source():
    return {
        "id": "headcount-test",
        "url": "https://api.headcountlabs.com/v1/jobs",
        "name": "Headcount Labs",
        "slug": "headcount",
    }


def _ca_job(**overrides):
    job = {
        "job_id": "11111111-1111-4111-8111-111111111111",
        "currentness": "current",
        "stale": False,
        "company_id": "22222222-2222-4222-8222-222222222222",
        "employer_name": {"state": "known", "value": "Example Nonprofit"},
        "title": {"state": "known", "value": "Program Coordinator"},
        "description": {
            "state": "known",
            "value": "Coordinate community programs across Ontario.",
        },
        "work_arrangement": {"state": "known", "value": "hybrid"},
        "locations": [
            {
                "state": "known",
                "value": {
                    "city": "Toronto",
                    "region": "CA-ON",
                    "country": "CA",
                },
            }
        ],
        "job_first_seen_at": "2026-10-20T12:00:00.000Z",
        "curated_at": "2026-10-21T12:00:00.000Z",
        "job_updated_at": "2026-10-22T12:00:00.000Z",
        "postings": [
            {
                "posting_id": "abc123",
                "source": "greenhouse",
                "source_posting_id": "999",
                "posting_status": "listed",
                "posting_url": {
                    "state": "known",
                    "value": "https://boards.greenhouse.io/example/jobs/999",
                },
                "application_url": {
                    "state": "known",
                    "value": "https://boards.greenhouse.io/example/jobs/999",
                },
                "location": {
                    "state": "known",
                    "value": {
                        "city": "Toronto",
                        "state": "ON",
                        "remote": False,
                        "country": "CA",
                    },
                },
                "pay": {
                    "state": "known",
                    "value": {
                        "min": 60000,
                        "max": 70000,
                        "currency": "CAD",
                        "interval": "year",
                    },
                },
                "source_posted_at": "2026-10-20T10:00:00.000Z",
                "source_data": {
                    "employment_type": "full_time",
                    "source_type": "greenhouse",
                    "availability": "listed",
                },
            }
        ],
        "company": {
            "company_id": "22222222-2222-4222-8222-222222222222",
            "name": "Example Nonprofit",
            "country": "CA",
            "status": "active",
            "website": "https://examplenonprofit.ca",
        },
    }
    job.update(overrides)
    return job


def mock_json_response(payload: dict, status_code: int = 200):
    class MockResponse:
        def __init__(self):
            self.status_code = status_code
            self._payload = payload
            self.text = json.dumps(payload)
            self.content = self.text.encode("utf-8")

        def raise_for_status(self):
            if self.status_code >= 400:
                from requests.exceptions import HTTPError

                raise HTTPError(f"{self.status_code} Error")

        def json(self):
            return self._payload

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            return False

    return MockResponse()


@pytest.fixture(autouse=True)
def clear_compare_only(monkeypatch):
    """Inherited COMPARE_ONLY=1 must not skip new URLs in this module's tests."""
    monkeypatch.delenv("COMPARE_ONLY", raising=False)


@pytest.fixture
def scraper_env(monkeypatch):
    monkeypatch.setenv("HEADCOUNTLABS_API_KEY", "jc_live_.test-key-for-unit-tests")
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    monkeypatch.setenv("WITHIN_WEEKS", "9999")
    monkeypatch.delenv("MAX_JOBS_PER_SOURCE", raising=False)
    # Offline sample path from a developer .env must not hijack API-mocked tests.
    monkeypatch.delenv("HEADCOUNTLABS_SAMPLE_PATH", raising=False)


def test_maps_core_fields(scraper_env):
    scraper = HeadcountLabsScraper(make_source())
    page = {"data": [_ca_job()], "next_cursor": None, "snapshot_watermark": "w1"}

    with patch("scrapers.headcount.requests.get", return_value=mock_json_response(page)):
        jobs = scraper.fetch_jobs()

    assert len(jobs) == 1
    job = jobs[0]
    assert job["job_title"] == "Program Coordinator"
    assert job["organization"] == "Example Nonprofit"
    assert "greenhouse.io/example/jobs/999" in job["listing_url"]
    assert "community programs" in job["description"]
    assert "Toronto" in (job.get("location") or "")
    assert job.get("wage") == "$60000 - $70000 CAD year"
    assert job.get("employment_type") in {"full-time", "full_time", "full time"} or (
        job.get("employment_type") and "full" in job["employment_type"]
    )
    assert job.get("website") == "https://examplenonprofit.ca"
    assert job["date_posted"].startswith("2026-10-20")
    dump = (job.get("extra") or {}).get("source_dump")
    assert isinstance(dump, dict)
    assert dump.get("job_id") == "11111111-1111-4111-8111-111111111111"


def test_requires_api_key(monkeypatch):
    monkeypatch.delenv("HEADCOUNTLABS_API_KEY", raising=False)
    monkeypatch.delenv("HEADCOUNTLABS_SAMPLE_PATH", raising=False)
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    assert HeadcountLabsScraper.is_configured() is False
    scraper = HeadcountLabsScraper(make_source())
    with pytest.raises(RuntimeError, match="HEADCOUNTLABS_API_KEY"):
        scraper.fetch_jobs()


def test_is_configured_with_api_key(monkeypatch):
    monkeypatch.delenv("HEADCOUNTLABS_SAMPLE_PATH", raising=False)
    monkeypatch.setenv("HEADCOUNTLABS_API_KEY", "jc_live_.test")
    assert HeadcountLabsScraper.is_configured() is True


def test_skips_missing_required_fields(scraper_env):
    scraper = HeadcountLabsScraper(make_source())
    incomplete = _ca_job()
    incomplete["title"] = {"state": "source_omitted", "value": None}
    page = {"data": [incomplete], "next_cursor": None}

    with patch("scrapers.headcount.requests.get", return_value=mock_json_response(page)):
        jobs = scraper.fetch_jobs()

    assert jobs == []


def test_respects_max_jobs(scraper_env, monkeypatch):
    monkeypatch.setenv("MAX_JOBS_PER_SOURCE", "1")
    scraper = HeadcountLabsScraper(make_source())
    second = _ca_job(
        job_id="33333333-3333-4333-8333-333333333333",
        title={"state": "known", "value": "Second Role"},
    )
    second["postings"][0]["posting_url"] = {
        "state": "known",
        "value": "https://boards.greenhouse.io/example/jobs/1000",
    }
    page = {"data": [_ca_job(), second], "next_cursor": None}

    with patch("scrapers.headcount.requests.get", return_value=mock_json_response(page)):
        jobs = scraper.fetch_jobs()

    assert len(jobs) == 1
    assert jobs[0]["job_title"] == "Program Coordinator"


def test_paginates_until_cursor_exhausted(scraper_env):
    scraper = HeadcountLabsScraper(make_source())
    page1_job = _ca_job()
    page2_job = _ca_job(
        job_id="44444444-4444-4444-8444-444444444444",
        title={"state": "known", "value": "Outreach Lead"},
    )
    page2_job["postings"][0]["posting_url"] = {
        "state": "known",
        "value": "https://boards.greenhouse.io/example/jobs/1001",
    }
    pages = [
        mock_json_response(
            {"data": [page1_job], "next_cursor": "cursor-2", "snapshot_watermark": "w1"}
        ),
        mock_json_response(
            {"data": [page2_job], "next_cursor": None, "snapshot_watermark": "w1"}
        ),
    ]

    with patch("scrapers.headcount.requests.get", side_effect=pages) as mock_get:
        jobs = scraper.fetch_jobs()

    assert len(jobs) == 2
    assert {j["job_title"] for j in jobs} == {"Program Coordinator", "Outreach Lead"}
    assert mock_get.call_count == 2
    second_url = mock_get.call_args_list[1].args[0]
    assert "cursor=cursor-2" in second_url


def test_falls_back_to_employer_name_without_company(scraper_env):
    scraper = HeadcountLabsScraper(make_source())
    record = _ca_job()
    record.pop("company", None)
    fields = scraper.parse_job(record)
    assert fields is not None
    assert fields["organization"] == "Example Nonprofit"


def test_build_list_params_canada_scoped(scraper_env):
    scraper = HeadcountLabsScraper(make_source())
    params = scraper.build_list_params()
    assert params["country"] == "CA"
    assert params["has_posting_url"] == "true"
    assert params["include"] == "company"


def test_loads_sample_path_without_api_key(monkeypatch, tmp_path):
    monkeypatch.delenv("HEADCOUNTLABS_API_KEY", raising=False)
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    monkeypatch.setenv("WITHIN_WEEKS", "9999")
    sample = tmp_path / "sample.json"
    sample.write_text(json.dumps([_ca_job()]), encoding="utf-8")
    monkeypatch.setenv("HEADCOUNTLABS_SAMPLE_PATH", str(sample))

    scraper = HeadcountLabsScraper(make_source())
    with patch("scrapers.headcount.requests.get") as mock_get:
        jobs = scraper.fetch_jobs()

    mock_get.assert_not_called()
    assert len(jobs) == 1
    assert jobs[0]["job_title"] == "Program Coordinator"


def test_loads_sample_wrapped_data_envelope(monkeypatch, tmp_path):
    monkeypatch.delenv("HEADCOUNTLABS_API_KEY", raising=False)
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    monkeypatch.setenv("WITHIN_WEEKS", "9999")
    sample = tmp_path / "sample.json"
    sample.write_text(
        json.dumps({"data": [_ca_job()], "next_cursor": None}),
        encoding="utf-8",
    )
    monkeypatch.setenv("HEADCOUNTLABS_SAMPLE_PATH", str(sample))

    jobs = HeadcountLabsScraper(make_source()).fetch_jobs()
    assert len(jobs) == 1


def test_stops_when_job_updated_at_outside_window(scraper_env, monkeypatch):
    monkeypatch.setenv("WITHIN_WEEKS", "1")
    scraper = HeadcountLabsScraper(make_source())
    fresh = _ca_job(
        job_updated_at="2026-11-04T12:00:00.000Z",
        job_first_seen_at="2026-11-04T12:00:00.000Z",
    )
    fresh["postings"][0]["source_posted_at"] = "2026-11-04T10:00:00.000Z"
    stale = _ca_job(
        job_id="55555555-5555-4555-8555-555555555555",
        job_updated_at="2020-01-01T00:00:00.000Z",
        title={"state": "known", "value": "Stale Role"},
    )
    stale["postings"][0]["posting_url"] = {
        "state": "known",
        "value": "https://boards.greenhouse.io/example/jobs/2000",
    }
    stale["postings"][0]["source_posted_at"] = "2020-01-01T00:00:00.000Z"
    pages = [
        mock_json_response({"data": [fresh], "next_cursor": "c2"}),
        mock_json_response({"data": [stale], "next_cursor": "c3"}),
        mock_json_response({"data": [fresh], "next_cursor": None}),
    ]
    with patch("scrapers.headcount.requests.get", side_effect=pages) as mock_get:
        jobs = scraper.fetch_jobs()
    assert len(jobs) == 1
    assert mock_get.call_count == 2


def test_sample_path_does_not_stop_on_stale_updated_at(monkeypatch, tmp_path):
    """Offline samples are not updated-sorted; skip stale rows without stopping."""
    monkeypatch.delenv("HEADCOUNTLABS_API_KEY", raising=False)
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    monkeypatch.setenv("WITHIN_WEEKS", "1")
    monkeypatch.delenv("MAX_JOBS_PER_SOURCE", raising=False)
    fresh = _ca_job(
        job_id="99999999-9999-4999-8999-999999999999",
        job_updated_at="2026-11-04T12:00:00.000Z",
        job_first_seen_at="2026-11-04T12:00:00.000Z",
        title={"state": "known", "value": "Fresh Sample Role"},
    )
    fresh["postings"][0]["source_posted_at"] = "2026-11-04T10:00:00.000Z"
    fresh["postings"][0]["posting_url"] = {
        "state": "known",
        "value": "https://boards.greenhouse.io/example/jobs/4000",
    }
    stale = _ca_job(
        job_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        job_updated_at="2020-01-01T00:00:00.000Z",
        title={"state": "known", "value": "Stale Sample Role"},
    )
    stale["postings"][0]["source_posted_at"] = "2020-01-01T00:00:00.000Z"
    stale["postings"][0]["posting_url"] = {
        "state": "known",
        "value": "https://boards.greenhouse.io/example/jobs/4001",
    }
    sample = tmp_path / "mixed.json"
    # Stale first — live path would stop; sample path must keep going.
    sample.write_text(json.dumps([stale, fresh]), encoding="utf-8")
    monkeypatch.setenv("HEADCOUNTLABS_SAMPLE_PATH", str(sample))

    jobs = HeadcountLabsScraper(make_source()).fetch_jobs()
    assert len(jobs) == 1
    assert jobs[0]["job_title"] == "Fresh Sample Role"


def test_page_cap_bounds_unbounded_pagination(scraper_env, monkeypatch):
    scraper = HeadcountLabsScraper(make_source())
    monkeypatch.setattr(scraper, "_MAX_PAGES", 2)

    def _page(cursor_out: str | None, job_id: str, url_suffix: str):
        record = _ca_job(
            job_id=job_id,
            title={"state": "known", "value": f"Role {url_suffix}"},
        )
        record["postings"][0]["posting_url"] = {
            "state": "known",
            "value": f"https://boards.greenhouse.io/example/jobs/{url_suffix}",
        }
        return mock_json_response({"data": [record], "next_cursor": cursor_out})

    pages = [
        _page("c2", "66666666-6666-4666-8666-666666666666", "3001"),
        _page("c3", "77777777-7777-4777-8777-777777777777", "3002"),
        _page(None, "88888888-8888-4888-8888-888888888888", "3003"),
    ]
    with patch("scrapers.headcount.requests.get", side_effect=pages) as mock_get:
        jobs = scraper.fetch_jobs()
    assert len(jobs) == 2
    assert mock_get.call_count == 2
