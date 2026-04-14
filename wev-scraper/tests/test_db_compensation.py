"""Tests for compensation field wiring in _job_row (task 5.3)."""
from unittest.mock import patch

from lib.compensation import CompensationExtraction


def _base_job(**overrides):
    job = {
        "job_title": "Software Engineer",
        "organization": "Acme Corp",
        "listing_url": "https://example.com/jobs/1",
        "description": "A great job.",
        "date_posted": "2026-01-01",
        "close_date": "2026-02-01",
        "location": "Montreal, QC",
        "employment_type": "FULL_TIME",
        "wage": "$60,000 / year",
    }
    job.update(overrides)
    return job


def _make_extraction(**overrides):
    defaults = dict(
        unit_text="YEAR",
        min_value=6000000,
        max_value=7500000,
        hours_per_week=None,
        currency="CAD",
        raw_note=None,
        confidence=0.95,
    )
    defaults.update(overrides)
    return CompensationExtraction(**defaults)  # type: ignore[arg-type]


# ── wage present: structured fields populated ─────────────────────────────────

@patch("utils.db.extract_and_guard")
def test_job_row_populates_compensation_fields(mock_extract):
    mock_extract.return_value = _make_extraction()
    from utils.db import _job_row
    row = _job_row(_base_job(), "src-1")

    assert row["unit_text"] == "YEAR"
    assert row["min_value"] == 6000000
    assert row["max_value"] == 7500000
    assert row["hours_per_week"] is None
    assert row["compensation_meta"]["confidence"] == 0.95
    assert row["compensation_meta"]["raw"] == "$60,000 / year"
    assert row["compensation_meta"]["currency"] == "CAD"
    assert "notes" not in row["compensation_meta"]


@patch("utils.db.extract_and_guard")
def test_job_row_includes_notes_when_raw_note_present(mock_extract):
    mock_extract.return_value = _make_extraction(
        unit_text=None, min_value=None, max_value=None,
        currency="USD", raw_note="$50k USD", confidence=0.8,
    )
    from utils.db import _job_row
    row = _job_row(_base_job(wage="$50k USD"), "src-1")

    assert row["unit_text"] is None
    assert row["compensation_meta"]["notes"] == "$50k USD"


@patch("utils.db.extract_and_guard")
def test_job_row_preserves_raw_wage_unchanged(mock_extract):
    mock_extract.return_value = _make_extraction()
    from utils.db import _job_row
    row = _job_row(_base_job(wage="$60,000 / year"), "src-1")

    assert row["wage"] == "$60,000 / year"


# ── wage absent: all five fields are None ─────────────────────────────────────

@patch("utils.db.extract_and_guard")
def test_job_row_nulls_compensation_when_wage_is_none(mock_extract):
    from utils.db import _job_row
    row = _job_row(_base_job(wage=None), "src-1")

    mock_extract.assert_not_called()
    assert row["unit_text"] is None
    assert row["min_value"] is None
    assert row["max_value"] is None
    assert row["hours_per_week"] is None
    assert row["compensation_meta"] is None


@patch("utils.db.extract_and_guard")
def test_job_row_nulls_compensation_when_wage_is_empty_string(mock_extract):
    from utils.db import _job_row
    row = _job_row(_base_job(wage=""), "src-1")

    mock_extract.assert_not_called()
    assert row["unit_text"] is None
    assert row["compensation_meta"] is None


# ── extraction raises: graceful degradation ───────────────────────────────────

@patch("utils.db.extract_and_guard", side_effect=RuntimeError("LLM timeout"))
def test_job_row_graceful_degradation_on_extraction_error(mock_extract):
    from utils.db import _job_row
    row = _job_row(_base_job(), "src-1")

    assert row["unit_text"] is None
    assert row["min_value"] is None
    assert row["max_value"] is None
    assert row["hours_per_week"] is None
    assert row["compensation_meta"] is None
    # raw wage must still be preserved
    assert row["wage"] == "$60,000 / year"
