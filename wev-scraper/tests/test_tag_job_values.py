import pytest
from unittest.mock import MagicMock, patch
import sys

# Mock sys.argv before importing the script to avoid the production check
with patch("sys.argv", ["tag_job_values.py"]):
    from scripts.tag_job_values import tag_job_values, _should_skip_existing, _has_text_evidence

def test_should_skip_existing():
    assert _should_skip_existing({"values": ["v1"]}, retag=False) is True
    assert _should_skip_existing({"values": ["v1"]}, retag=True) is False
    assert _should_skip_existing({"values": []}, retag=False) is False
    assert _should_skip_existing({}, retag=False) is False

def test_has_text_evidence():
    assert _has_text_evidence({"job_title": "T"}) is True
    assert _has_text_evidence({"summary": "S"}) is True
    assert _has_text_evidence({"description": "D"}) is True
    assert _has_text_evidence({"job_title": "", "summary": None}) is False

@patch("scripts.tag_job_values.JobValuesTagger")
@patch("scripts.tag_job_values.supabase")
def test_tag_job_values_success(mock_supabase, mock_tagger_class):
    # Mock tagger
    mock_tagger = mock_tagger_class.return_value
    mock_tagger.tag_jobs_batch.return_value = [{"values": ["v1"], "reasoning": "R"}]
    
    # Mock jobs
    mock_supabase.table.return_value.select.return_value.order.return_value.range.return_value.execute.return_value.data = [
        {"id": "j1", "job_title": "T", "description": "D", "values": None}
    ]

    res = tag_job_values(limit=10, dry_run=True)
    assert res["tagged"] == 1
    assert res["errors"] == 0

@patch("scripts.tag_job_values.JobValuesTagger")
@patch("scripts.tag_job_values.supabase")
def test_tag_job_values_single_job(mock_supabase, mock_tagger_class):
    mock_tagger = mock_tagger_class.return_value
    mock_tagger.tag_jobs_batch.return_value = [{"values": ["v1"]}]
    
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"id": "j1", "job_title": "T", "description": "D", "values": None}
    ]

    res = tag_job_values(job_id="j1", dry_run=True)
    assert res["tagged"] == 1

@patch("scripts.tag_job_values.JobValuesTagger")
@patch("scripts.tag_job_values.supabase")
def test_tag_job_values_db_error(mock_supabase, mock_tagger_class):
    mock_supabase.table.return_value.select.return_value.order.return_value.range.return_value.execute.side_effect = Exception("DB Error")
    res = tag_job_values(limit=10)
    assert res["errors"] == 1
