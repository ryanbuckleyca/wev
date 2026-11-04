"""Tests for TheirStack scraper."""

from __future__ import annotations

import json

from scrapers.theirstack import DEFAULT_DOMAIN_NOT, DEFAULT_DOMAIN_OR, TheirStackScraper


def _scraper() -> TheirStackScraper:
    return TheirStackScraper(
        {
            "id": "t",
            "name": "TheirStack",
            "url": "https://api.theirstack.com/v1/jobs/search",
            "slug": "theirstack",
        }
    )


def _sample_record(**overrides):
    record = {
        "id": 1,
        "job_title": "Community Coordinator",
        "company_object": {"name": "Example Org", "domain": "example.org"},
        "final_url": "https://ca.indeed.com/viewjob?jk=abc123",
        "description": "Coordinate community programs across Ontario.",
        "location": "Toronto, ON, Canada",
        "cities": ["Toronto"],
        "state_code": "ON",
        "date_posted": "2026-10-01",
        "remote": False,
        "hybrid": False,
        "employment_statuses": ["full_time"],
    }
    record.update(overrides)
    return record


def test_build_search_body_defaults_to_ca_indeed_linkedin(monkeypatch):
    monkeypatch.delenv("THEIRSTACK_URL_DOMAIN_OR", raising=False)
    monkeypatch.delenv("THEIRSTACK_URL_DOMAIN_NOT", raising=False)
    monkeypatch.delenv("THEIRSTACK_POSTED_AT_MAX_AGE_DAYS", raising=False)
    monkeypatch.setenv("WITHIN_WEEKS", "2")
    body = _scraper().build_search_body(25)
    assert body["job_country_code_or"] == ["CA"]
    assert "indeed.com" in body["url_domain_or"]
    assert "linkedin.com" in body["url_domain_or"]
    assert "greenhouse.io" in body["url_domain_not"]
    assert body["posted_at_max_age_days"] == 14


def test_parse_and_fetch_sample(monkeypatch, tmp_path):
    record = _sample_record()
    fields = _scraper().parse_job(record)
    assert fields is not None
    assert fields["job_title"] == "Community Coordinator"
    assert fields["organization"] == "Example Org"
    assert fields["listing_url"]
    assert fields["description"]

    sample = tmp_path / "theirstack.json"
    sample.write_text(json.dumps({"data": [record]}), encoding="utf-8")
    monkeypatch.setenv("THEIRSTACK_SAMPLE_PATH", str(sample))
    monkeypatch.setenv("WITHIN_WEEKS", "9999")
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    jobs = _scraper().fetch_jobs()
    assert len(jobs) >= 1


def test_default_domain_constants_partition_channels():
    assert "indeed.com" in DEFAULT_DOMAIN_OR
    assert "linkedin.com" in DEFAULT_DOMAIN_OR
    assert "myworkdayjobs.com" in DEFAULT_DOMAIN_NOT
