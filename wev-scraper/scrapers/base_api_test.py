"""Tests for BaseApiScraper — shared JSON/HTTP API scraper base."""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import patch

import pytest

from scrapers.apify import ApifyJobBankScraper
from scrapers.base_api import BaseApiScraper
from scrapers.headcount import HeadcountLabsScraper
from scrapers.serpapi_google_jobs import SerpApiGoogleJobsScraper
from scrapers.theirstack import TheirStackScraper
from scrapers.thejobsapi import TheJobsApiScraper

_RECENT_PATCH = "scrapers.base_api.is_recent_job"


def _source(**overrides) -> dict[str, Any]:
    base = {
        "id": "api-test",
        "name": "API Test",
        "url": "https://example.com/api",
        "slug": "api-test",
    }
    base.update(overrides)
    return base


class _ToyApiScraper(BaseApiScraper):
    """Minimal concrete subclass for base-class unit tests."""

    sample_path_envs = ("TOY_API_SAMPLE_PATH",)
    sample_list_keys = ("data", "jobs")

    def parse_job(self, record: dict[str, Any]) -> dict[str, Any] | None:
        title = (record.get("title") or "").strip()
        org = (record.get("organization") or "").strip()
        url = (record.get("url") or "").strip()
        if not title or not org or not url:
            return None
        return {
            "job_title": title,
            "organization": org,
            "listing_url": url,
            "description": record.get("description") or "",
            "date_posted": record.get("date_posted"),
            "employment_type": record.get("employment_type"),
        }


def test_close_browser_is_noop():
    scraper = _ToyApiScraper(_source())
    scraper.close_browser()


def test_parse_job_required_on_base():
    with pytest.raises(NotImplementedError):
        BaseApiScraper(_source()).parse_job({"title": "x"})


def test_five_api_scrapers_subclass_base():
    assert issubclass(SerpApiGoogleJobsScraper, BaseApiScraper)
    assert issubclass(ApifyJobBankScraper, BaseApiScraper)
    assert issubclass(TheJobsApiScraper, BaseApiScraper)
    assert issubclass(TheirStackScraper, BaseApiScraper)
    assert issubclass(HeadcountLabsScraper, BaseApiScraper)


def test_get_sample_path_first_env_wins(monkeypatch):
    scraper = _ToyApiScraper(_source())
    assert scraper.get_sample_path() is None
    monkeypatch.setenv("TOY_API_SAMPLE_PATH", " /tmp/toy.json ")
    assert scraper.get_sample_path() == "/tmp/toy.json"


def test_load_sample_records_list_and_keyed(tmp_path):
    scraper = _ToyApiScraper(_source())
    bare = tmp_path / "bare.json"
    bare.write_text(
        json.dumps([{"title": "A", "organization": "Org", "url": "https://ex.com/a"}]),
        encoding="utf-8",
    )
    assert len(scraper._load_sample_records(str(bare))) == 1

    keyed = tmp_path / "keyed.json"
    keyed.write_text(
        json.dumps(
            {
                "data": [
                    {"title": "B", "organization": "Org", "url": "https://ex.com/b"},
                ]
            }
        ),
        encoding="utf-8",
    )
    assert len(scraper._load_sample_records(str(keyed))) == 1


def test_load_sample_records_missing_file(tmp_path):
    scraper = _ToyApiScraper(_source())
    with pytest.raises(RuntimeError, match="not found"):
        scraper._load_sample_records(str(tmp_path / "missing.json"))


@patch(_RECENT_PATCH, return_value=True)
def test_process_record_attaches_source_dump(mock_recent, monkeypatch):
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    scraper = _ToyApiScraper(_source())
    record = {
        "title": "Coordinator",
        "organization": "Example Org",
        "url": "https://example.com/jobs/1",
        "description": "Do the work.",
        "date_posted": "2026-10-20",
        "provider_id": "raw-99",
    }
    job, stop = scraper._process_record(record, 0, weeks=9999)
    assert stop is False
    assert job is not None
    dump = (job.get("extra") or {}).get("source_dump")
    assert dump is record
    assert dump.get("provider_id") == "raw-99"
    assert "https://example.com/jobs/1" in scraper.scraped_urls


@patch(_RECENT_PATCH, return_value=True)
def test_process_record_skips_existing_url(mock_recent, monkeypatch):
    monkeypatch.setenv("SHOULD_GEOCODE", "0")
    monkeypatch.delenv("SHOULD_OVERRIDE_EXISTING", raising=False)
    scraper = _ToyApiScraper(_source())
    url = "https://example.com/jobs/dup"
    scraper.existing_urls.add(url)
    job, stop = scraper._process_record(
        {"title": "Dup", "organization": "Org", "url": url, "description": "x"},
        0,
        weeks=9999,
    )
    assert job is None
    assert stop is False
    assert scraper.skipped_duplicates == 1


@patch(_RECENT_PATCH, return_value=False)
def test_process_record_chronological_stop_on_stale(mock_recent, monkeypatch):
    monkeypatch.setenv("SHOULD_GEOCODE", "0")

    class Chrono(_ToyApiScraper):
        is_chronological = True

    scraper = Chrono(_source())
    job, stop = scraper._process_record(
        {
            "title": "Old",
            "organization": "Org",
            "url": "https://example.com/jobs/old",
            "date_posted": "2020-01-01",
            "description": "x",
        },
        0,
        weeks=2,
    )
    assert job is None
    assert stop is True


@patch(_RECENT_PATCH, return_value=False)
def test_defer_scraped_url_until_accepted(mock_recent, monkeypatch):
    monkeypatch.setenv("SHOULD_GEOCODE", "0")

    class Deferred(_ToyApiScraper):
        defer_scraped_url_until_accepted = True

    scraper = Deferred(_source())
    url = "https://example.com/jobs/fresh-later"
    job, stop = scraper._process_record(
        {
            "title": "Maybe",
            "organization": "Org",
            "url": url,
            "date_posted": "3 days ago",
            "description": "x",
        },
        0,
        weeks=2,
    )
    assert job is None
    assert stop is False
    assert url not in scraper.scraped_urls


@patch(_RECENT_PATCH, return_value=True)
def test_should_stop_before_accept_hook(mock_recent, monkeypatch):
    monkeypatch.setenv("SHOULD_GEOCODE", "0")

    class Stopping(_ToyApiScraper):
        def _should_stop_before_accept(self, record, fields, *, weeks):
            return bool(record.get("stop"))

    scraper = Stopping(_source())
    job, stop = scraper._process_record(
        {
            "title": "Stop",
            "organization": "Org",
            "url": "https://example.com/jobs/stop",
            "description": "x",
            "stop": True,
        },
        0,
        weeks=9999,
    )
    assert job is None
    assert stop is True
