"""Tests for SerpApi Google Jobs scraper."""

from __future__ import annotations

import json
import re

from scrapers.serpapi_google_jobs import SerpApiGoogleJobsScraper


def _scraper() -> SerpApiGoogleJobsScraper:
    return SerpApiGoogleJobsScraper(
        {
            "id": "t",
            "name": "SerpApi Google Jobs",
            "url": "https://serpapi.com/google-jobs-api",
            "slug": "serpapi",
        }
    )


def _sample_record(**overrides):
    record = {
        "title": "Registered Social Worker",
        "company_name": "Example Clinic",
        "description": "Provide community mental health support in Toronto.",
        "location": "Toronto, ON, Canada",
        "job_id": "abc123",
        "via": "LinkedIn",
        "apply_options": [
            {"link": "https://www.google.com/search?q=job"},
            {"link": "https://boards.greenhouse.io/example/jobs/1"},
        ],
        "detected_extensions": {
            "posted_at": "3 days ago",
            "schedule_type": "Full-time",
        },
    }
    record.update(overrides)
    return record


def test_parse_job_maps_google_jobs_fields():
    fields = _scraper().parse_job(_sample_record())
    assert fields is not None
    assert fields["job_title"] == "Registered Social Worker"
    assert fields["organization"] == "Example Clinic"
    assert fields["listing_url"] == "https://boards.greenhouse.io/example/jobs/1"
    assert "google.com/search" not in fields["listing_url"]
    assert fields["municipality"] == "Toronto"
    assert fields["province"] == "ON"
    assert fields["description"]


def test_split_location_city_canada_keeps_municipality():
    s = _scraper()
    assert s._split_location("Toronto, Canada") == ("Toronto", None)
    assert s._split_location("Toronto, ON, Canada") == ("Toronto", "ON")
    assert s._split_location("Vancouver, BC") == ("Vancouver", "BC")
    assert s._split_location("Canada") == (None, None)


def test_fetch_jobs_from_sample(monkeypatch, tmp_path):
    sample = tmp_path / "serpapi.json"
    sample.write_text(json.dumps([_sample_record()]), encoding="utf-8")
    monkeypatch.setenv("SERPAPI_GOOGLE_JOBS_SAMPLE_PATH", str(sample))
    monkeypatch.setenv("WITHIN_WEEKS", "9999")
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    jobs = _scraper().fetch_jobs()
    assert len(jobs) >= 1
    assert all(j.get("listing_url") for j in jobs)
    dated = [j for j in jobs if j.get("date_posted")]
    assert dated
    assert all(re.match(r"^\d{4}-\d{2}-\d{2}", j["date_posted"]) for j in dated)
