"""Tests for utils.normalize.normalize_job_data location handling."""

from utils.normalize import normalize_job_data


def _no_geocode(monkeypatch):
    # Force the reuse-existing path so no Geocodio/network call happens.
    monkeypatch.delenv("SHOULD_GEOCODE", raising=False)
    monkeypatch.delenv("SHOULD_RE_GEOCODE", raising=False)


def test_normalize_job_data_collapses_repeated_location_tokens(monkeypatch):
    _no_geocode(monkeypatch)
    result = normalize_job_data(
        {
            "job_title": "Program Manager",
            "organization": "Mabelle Arts",
            "location": "EtobicokeEtobicokeEtobicokeEtobicoke",
            "municipality": "Etobicoke",
            "province": "ON",
        }
    )
    assert result["location"] == "Etobicoke"


def test_normalize_job_data_preserves_clean_location(monkeypatch):
    _no_geocode(monkeypatch)
    result = normalize_job_data(
        {
            "job_title": "Coordinator",
            "organization": "Some Org",
            "location": "Toronto, ON",
            "municipality": "Toronto",
            "province": "ON",
        }
    )
    assert result["location"] == "Toronto, ON"


def test_normalize_job_data_blank_location_stays_none(monkeypatch):
    _no_geocode(monkeypatch)
    result = normalize_job_data(
        {
            "job_title": "Coordinator",
            "organization": "Some Org",
            "location": "   ",
        }
    )
    assert result["location"] is None


def test_normalize_job_data_returns_none_for_us_only_location(monkeypatch):
    _no_geocode(monkeypatch)
    result = normalize_job_data(
        {
            "job_title": "Installer",
            "organization": "US Co",
            "location": "Boston, Massachusetts, United States",
            "listing_url": "https://example.com/us-job",
        }
    )
    assert result is None


def test_normalize_job_data_keeps_canada_us_hybrid_remote(monkeypatch):
    _no_geocode(monkeypatch)
    result = normalize_job_data(
        {
            "job_title": "Account Executive",
            "organization": "Recycle Coach",
            "location": "Remote | Western USA or Western Canada strongly preferred",
            "listing_url": "https://example.com/hybrid",
        }
    )
    assert result is not None
    assert "Canada" in result["location"]
