import pytest
from unittest.mock import MagicMock, patch
from scripts.process_jobs_unified import process_jobs_unified, _update_job_in_database

@patch("scripts.process_jobs_unified.UnifiedJobProcessor")
@patch("scripts.process_jobs_unified.supabase")
@patch("scripts.process_jobs_unified.create_provider_aware_batches")
def test_process_jobs_unified_success(mock_create_batches, mock_supabase, mock_processor_class):
    # Mock processor
    mock_processor = mock_processor_class.return_value
    mock_processor.get_token_limits.return_value = {"recommended_batch_size": 100}
    mock_processor.process_jobs.return_value = {
        "results": [{"summary": "Job summary", "values": ["value1"], "is_sse": True}],
        "provider": "gemini",
        "has_grounding": False
    }

    # Mock jobs
    mock_supabase.table.return_value.select.return_value.limit.return_value.execute.return_value.data = [
        {"id": "j1", "description": "Some text", "summary": None, "values": None}
    ]

    # Mock batches
    mock_create_batches.return_value = [[{"id": "j1", "description": "Some text"}]]

    res = process_jobs_unified(limit=10)

    assert res["processed"] == 1
    assert res["errors"] == 0
    assert res["batches_processed"] == 1
    assert res["provider_used"] == "gemini"

@patch("scripts.process_jobs_unified.UnifiedJobProcessor")
def test_process_jobs_unified_init_error(mock_processor_class):
    mock_processor_class.side_effect = Exception("Init error")
    res = process_jobs_unified()
    assert res["errors"] == 1
    assert res["processed"] == 0

@patch("scripts.process_jobs_unified.UnifiedJobProcessor")
@patch("scripts.process_jobs_unified.supabase")
def test_process_jobs_unified_fetch_error(mock_supabase, mock_processor_class):
    mock_supabase.table.return_value.select.return_value.limit.return_value.execute.side_effect = Exception("Fetch error")
    res = process_jobs_unified()
    assert res["errors"] == 1

@patch("scripts.process_jobs_unified.UnifiedJobProcessor")
@patch("scripts.process_jobs_unified.supabase")
def test_process_jobs_unified_filtering(mock_supabase, mock_processor_class):
    mock_supabase.table.return_value.select.return_value.limit.return_value.execute.return_value.data = [
        {"id": "j1", "description": "text", "summary": "exists", "values": "exists"}, # skip
        {"id": "j2", "description": " ", "summary": None}, # skip no text
        {"id": "j3", "description": "text", "summary": None} # eligible
    ]

    with patch("scripts.process_jobs_unified.create_provider_aware_batches") as mock_create:
        mock_create.return_value = []
        res = process_jobs_unified()
        assert res["skipped_existing"] == 1
        assert res["skipped_no_text"] == 1

@patch("scripts.process_jobs_unified.supabase")
def test_update_job_in_database(mock_supabase):
    result = {
        "summary": "S",
        "values": ["V"],
        "values_rated": {"V": 5},
        "is_sse": True,
        "sse_confidence": 0.9
    }
    _update_job_in_database("j1", result)
    mock_supabase.table.return_value.update.assert_called_once()
    args = mock_supabase.table.return_value.update.call_args[0][0]
    assert args["summary"] == "S"
    assert args["values"] == ["V"]
    assert args["is_sse"] is True
