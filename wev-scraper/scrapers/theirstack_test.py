"""Tests for TheirStack scraper."""

from __future__ import annotations

import json

from scrapers.theirstack import DEFAULT_DOMAIN_NOT, DEFAULT_DOMAIN_OR, TheirStackScraper


def _scraper() -> TheirStackScraper:
    """Test helper for scraper."""
    return TheirStackScraper(
        {
            "id": "t",
            "name": "TheirStack",
            "url": "https://api.theirstack.com/v1/jobs/search",
            "slug": "theirstack",
        }
    )


def _sample_record(**overrides):
    """Test helper for sample record."""
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
    """Cover build search body defaults to ca indeed linkedin."""
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


def test_build_search_body_blank_domain_override_falls_back(monkeypatch):
    """Cover build search body blank domain override falls back."""
    monkeypatch.setenv("THEIRSTACK_URL_DOMAIN_OR", " , , ")
    monkeypatch.delenv("THEIRSTACK_URL_DOMAIN_NOT", raising=False)
    monkeypatch.setenv("WITHIN_WEEKS", "2")
    body = _scraper().build_search_body(25)
    assert "indeed.com" in body["url_domain_or"]
    assert "linkedin.com" in body["url_domain_or"]


def test_parse_and_fetch_sample(monkeypatch, tmp_path):
    """Cover parse and fetch sample."""
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
    dump = (jobs[0].get("extra") or {}).get("source_dump")
    assert isinstance(dump, dict)
    assert dump.get("job_title") == "Community Coordinator"


def test_default_domain_constants_partition_channels():
    """Cover default domain constants partition channels."""
    assert "indeed.com" in DEFAULT_DOMAIN_OR
    assert "linkedin.com" in DEFAULT_DOMAIN_OR
    assert "myworkdayjobs.com" in DEFAULT_DOMAIN_NOT


def test_fetch_canada_jobs_sizes_final_offset_page(monkeypatch):
    """Offset paging keeps a capped page size and never requests past ``limit``."""
    monkeypatch.setenv("THEIRSTACK_API_KEY", "test-key")
    monkeypatch.setenv("THEIRSTACK_MAX_ITEMS", "150")
    monkeypatch.delenv("MAX_JOBS_PER_SOURCE", raising=False)
    monkeypatch.delenv("THEIRSTACK_SAMPLE_PATH", raising=False)
    scraper = _scraper()

    seen: list[dict] = []

    class _Resp:
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

    def fake_post(url, headers=None, json=None, timeout=None):
        seen.append(dict(json or {}))
        offset = int((json or {}).get("offset") or 0)
        limit = int((json or {}).get("limit") or 0)
        batch = [
            _sample_record(
                id=offset + i,
                final_url=f"https://ca.indeed.com/viewjob?jk={offset + i}",
            )
            for i in range(limit)
        ]
        return _Resp({"data": batch})

    monkeypatch.setattr("scrapers.theirstack.requests.post", fake_post)
    records = scraper._fetch_canada_jobs()
    assert len(records) == 150
    assert [b["offset"] for b in seen] == [0, 100]
    assert [b["limit"] for b in seen] == [100, 50]
    assert all("page" not in b for b in seen)
