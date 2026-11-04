"""Tests for The Jobs API scraper."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from scrapers.thejobsapi import TheJobsApiScraper, window_for_within_weeks


def _scraper() -> TheJobsApiScraper:
    return TheJobsApiScraper(
        {
            "id": "t",
            "name": "The Jobs API",
            "url": "https://api.thejobsapi.com/v1/jobs",
            "slug": "thejobsapi",
        }
    )


def _sample_detail(**overrides):
    detail = {
        "id": 1,
        "title": "Registered Nurse",
        "organization": "Example Health",
        "url": "https://boards.greenhouse.io/example/jobs/1",
        "apply_url": "https://boards.greenhouse.io/example/jobs/1",
        "country": "CA",
        "description_text": "Provide patient care in an outpatient clinic. " * 10,
        "locations": [{"city": "Toronto", "province": "ON", "country": "CA"}],
        "posted_at": "2026-10-01T00:00:00Z",
        "employment_types": ["FULL_TIME"],
        "remote": False,
        "source": "greenhouse",
    }
    detail.update(overrides)
    return detail


def test_window_for_within_weeks_covers_two_weeks():
    assert window_for_within_weeks(1) == "7d"
    assert window_for_within_weeks(2) == "30d"
    assert window_for_within_weeks(4) == "30d"
    assert window_for_within_weeks(8) == "6m"


def test_resolve_window_prefers_env(monkeypatch):
    monkeypatch.setenv("TJA_WINDOW", "7d")
    assert _scraper().resolve_window(weeks=8) == "7d"


def test_parse_job_requires_url_org_title():
    s = _scraper()
    fields = s.parse_job(_sample_detail(url=None, apply_url="https://example.com/apply"))
    assert fields is not None
    assert fields["organization"] == "Example Health"
    assert fields["listing_url"] == "https://example.com/apply"
    assert len(fields["description"]) > 100
    assert s.parse_job({"title": "x", "organization": "y"}) is None


def test_fetch_jobs_from_sample(monkeypatch, tmp_path):
    sample = tmp_path / "tja.json"
    sample.write_text(json.dumps([_sample_detail()]), encoding="utf-8")
    monkeypatch.setenv("TJA_SAMPLE_PATH", str(sample))
    monkeypatch.setenv("WITHIN_WEEKS", "9999")
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    jobs = _scraper().fetch_jobs()
    assert len(jobs) == 1
    assert jobs[0]["job_title"] == "Registered Nurse"


def test_outdated_job_does_not_stop_later_fresh_jobs(monkeypatch, tmp_path):
    """window bounds the API call; client skip must not early-break the list."""
    assert _scraper().is_chronological is False
    now = datetime.now(timezone.utc)
    stale = _sample_detail(
        id=1,
        title="Old Role",
        url="https://boards.greenhouse.io/example/jobs/old",
        posted_at=(now - timedelta(days=60)).isoformat().replace("+00:00", "Z"),
    )
    fresh = _sample_detail(
        id=2,
        title="Fresh Role",
        url="https://boards.greenhouse.io/example/jobs/new",
        posted_at=(now - timedelta(days=2)).isoformat().replace("+00:00", "Z"),
    )
    sample = tmp_path / "tja-mixed.json"
    sample.write_text(json.dumps([stale, fresh]), encoding="utf-8")
    monkeypatch.setenv("TJA_SAMPLE_PATH", str(sample))
    monkeypatch.setenv("WITHIN_WEEKS", "2")
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    jobs = _scraper().fetch_jobs()
    assert [j["job_title"] for j in jobs] == ["Fresh Role"]


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


def test_fetch_canada_details_sends_window(monkeypatch):
    monkeypatch.delenv("TJA_SAMPLE_PATH", raising=False)
    monkeypatch.delenv("TJA_WINDOW", raising=False)
    monkeypatch.delenv("TJA_TIME_FRAME", raising=False)
    monkeypatch.setenv("TJA_API_KEY", "tja_live_.test")
    monkeypatch.setenv("WITHIN_WEEKS", "2")
    monkeypatch.setenv("TJA_MAX_ITEMS", "10")

    with patch(
        "scrapers.thejobsapi.requests.get",
        return_value=_JsonResp({"jobs": [], "next_cursor": None}),
    ) as mock_get:
        _scraper()._fetch_canada_details()

    assert mock_get.call_count == 1
    params = mock_get.call_args.kwargs["params"]
    assert params["window"] == "30d"
    assert params["description"] == "text"
    assert "cursor" not in params
    assert "time_frame" not in params
    assert "description_format" not in params


def test_fetch_canada_details_follows_next_cursor(monkeypatch):
    monkeypatch.delenv("TJA_SAMPLE_PATH", raising=False)
    monkeypatch.setenv("TJA_API_KEY", "tja_live_.test")
    monkeypatch.setenv("TJA_WINDOW", "7d")
    monkeypatch.setenv("TJA_MAX_ITEMS", "3")

    page1 = {
        "jobs": [
            _sample_detail(id=1, url="https://boards.greenhouse.io/example/jobs/1"),
            _sample_detail(id=2, url="https://boards.greenhouse.io/example/jobs/2"),
        ],
        "next_cursor": "cursor-2",
    }
    page2 = {
        "jobs": [
            _sample_detail(id=3, url="https://boards.greenhouse.io/example/jobs/3"),
            _sample_detail(id=4, url="https://boards.greenhouse.io/example/jobs/4"),
        ],
        "next_cursor": "cursor-3",
    }

    with (
        patch("scrapers.thejobsapi.time.sleep"),
        patch(
            "scrapers.thejobsapi.requests.get",
            side_effect=[_JsonResp(page1), _JsonResp(page2)],
        ) as mock_get,
    ):
        details = _scraper()._fetch_canada_details()

    assert mock_get.call_count == 2
    assert mock_get.call_args_list[0].kwargs["params"]["limit"] == 3
    assert "cursor" not in mock_get.call_args_list[0].kwargs["params"]
    assert mock_get.call_args_list[1].kwargs["params"]["cursor"] == "cursor-2"
    assert mock_get.call_args_list[1].kwargs["params"]["limit"] == 1
    assert [d["id"] for d in details] == [1, 2, 3]


def test_fetch_canada_details_stops_when_next_cursor_clears(monkeypatch):
    monkeypatch.delenv("TJA_SAMPLE_PATH", raising=False)
    monkeypatch.setenv("TJA_API_KEY", "tja_live_.test")
    monkeypatch.setenv("TJA_WINDOW", "7d")
    monkeypatch.setenv("TJA_MAX_ITEMS", "50")

    with patch(
        "scrapers.thejobsapi.requests.get",
        return_value=_JsonResp(
            {
                "jobs": [
                    _sample_detail(id=1, url="https://boards.greenhouse.io/example/jobs/1")
                ],
                "next_cursor": None,
            }
        ),
    ) as mock_get:
        details = _scraper()._fetch_canada_details()

    assert mock_get.call_count == 1
    assert len(details) == 1
