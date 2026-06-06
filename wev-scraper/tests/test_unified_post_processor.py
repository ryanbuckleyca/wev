import json
import pytest
from unittest.mock import MagicMock, patch
from scripts.unified_post_processor import (
    process_jobs_unified,
    _build_update_data,
    is_transient_db_error,
    _try_db_write,
    main
)

def test_build_update_data():
    job_result = {
        "summary": "Job summary",
        "values": ["Ambition"],
        "values_rated": [{"value": "Ambition", "rank": 1}],
        "is_sse": True,
        "sse_confidence": 0.9,
        "sse_details": "Reasoning"
    }

    # Task all
    data = _build_update_data("all", job_result)
    assert data["summary"] == "Job summary"
    assert data["values"] == ["Ambition"]
    assert data["is_sse"] is True
    assert "Reasoning" in data["sse_details"]

    # Task summary only
    data = _build_update_data("summary", job_result)
    assert "summary" in data
    assert "values" not in data

    # Task sse only
    data = _build_update_data("sse", job_result)
    assert "is_sse" in data
    assert "summary" not in data

def test_is_transient_db_error():
    e = Exception("timeout")
    e.code = "53000"
    assert is_transient_db_error(e) is True

    e.code = "08001"
    assert is_transient_db_error(e) is True

    e.code = "42703" # Not transient
    assert is_transient_db_error(e) is False

    assert is_transient_db_error(TimeoutError()) is True

@patch("scripts.unified_post_processor.supabase")
def test_try_db_write_success(mock_supabase):
    mock_table = mock_supabase.table.return_value
    mock_update = mock_table.update.return_value
    mock_eq = mock_update.eq.return_value

    _try_db_write({"id": "j1"}, {"summary": "S"}, mock_supabase)
    mock_table.update.assert_called_with({"summary": "S"})

@patch("scripts.unified_post_processor.get_unified_processor")
@patch("scripts.unified_post_processor.supabase")
def test_process_jobs_unified_success(mock_supabase, mock_get_processor):
    mock_processor = mock_get_processor.return_value
    mock_processor.process_jobs.return_value = {
        "results": [{"summary": "S1", "values": ["V1"], "is_sse": True}],
        "provider": "groq"
    }

    mock_jobs = [{"id": "j1", "summary": None, "values": None, "is_sse": None}]
    mock_supabase.table.return_value.select.return_value.limit.return_value.execute.return_value.data = mock_jobs
    mock_supabase.table.return_value.select.return_value.execute.return_value.count = 1

    res = process_jobs_unified(task="all", limit=1)

    assert res["processed"] == 1
    assert res["updated"]["summary"] == 1
    assert res["provider_used"] == "groq"

@patch("scripts.unified_post_processor.get_unified_processor")
@patch("scripts.unified_post_processor.supabase")
def test_process_jobs_unified_skips_already_processed(mock_supabase, mock_get_processor):
    # Job already has everything
    mock_jobs = [{"id": "j1", "summary": "Done", "values": ["V1"], "is_sse": True, "sse_details": "Done"}]
    mock_supabase.table.return_value.select.return_value.limit.return_value.execute.return_value.data = mock_jobs
    mock_supabase.table.return_value.select.return_value.execute.return_value.count = 1

    res = process_jobs_unified(task="all")
    assert res["processed"] == 0 # No jobs filtered for processing

@patch("scripts.unified_post_processor.process_jobs_unified")
def test_main_cli(mock_process):
    # Mock return value to satisfy the summary printing logic
    mock_process.return_value = {
        "processed": 5,
        "skipped": 0,
        "provider_used": "groq",
        "updated": {"summary": 0, "values": 0, "sse": 0},
        "errors": 0
    }
    with patch("sys.argv", ["unified_post_processor.py", "--task", "sse", "--limit", "5"]):
        with patch("scripts.unified_post_processor.argparse.ArgumentParser.parse_args") as mock_args:
            args = MagicMock()
            args.task = "sse"
            args.limit = 5
            args.job_id = None
            args.dry_run = False
            args.prod = False
            args.publish = False
            args.verbose = False
            mock_args.return_value = args

            main()
            mock_process.assert_called_with(
                task="sse", limit=5, job_ids=None, dry_run=False, verbose=False
            )
