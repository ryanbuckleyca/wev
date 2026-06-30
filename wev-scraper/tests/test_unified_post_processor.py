from unittest.mock import MagicMock, patch

from scripts.unified_post_processor import (
    ProcessingOptions,
    _build_update_data,
    _needs_processing,
    _try_db_write,
    is_transient_db_error,
    main,
    process_jobs_unified,
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

    # Task language
    job_result["language"] = "fr"
    data = _build_update_data("language", job_result)
    assert data["language"] == "fr"

    # Task all: Language is added when valid and differing
    data = _build_update_data("all", job_result, {"language": "en"})
    assert data["language"] == "fr"

    # Task all: Language clobbering prevention (invalid or None language)
    job_result["language"] = None
    data = _build_update_data("all", job_result, {"language": "en"})
    assert "language" not in data

    # Task all: Invalid language does not overwrite
    job_result["language"] = "de"
    data = _build_update_data("all", job_result, {"language": "en"})
    assert "language" not in data

def test_is_transient_db_error():
    e = Exception("timeout")
    e.code = "53000"
    assert is_transient_db_error(e) is True

    e.code = "08001"
    assert is_transient_db_error(e) is True

    e.code = "503"
    assert is_transient_db_error(e) is True

    e.code = "500"
    assert is_transient_db_error(e) is False

    e.code = "42703" # Not transient
    assert is_transient_db_error(e) is False

    assert is_transient_db_error(TimeoutError()) is True


def test_needs_processing_all_skips_complete_sse_false():
    job = {
        "summary": "Done",
        "values": ["V1"],
        "is_sse": False,
        "sse_details": "",
        "language": "en",
    }
    assert _needs_processing(job, ProcessingOptions(task="all")) is False


def test_needs_processing_all_requires_language():
    job = {
        "summary": "Done",
        "values": ["V1"],
        "is_sse": False,
        "language": "de",
    }
    assert _needs_processing(job, ProcessingOptions(task="all")) is True

@patch("scripts.unified_post_processor.supabase")
def test_try_db_write_success(mock_supabase):
    mock_table = mock_supabase.table.return_value

    _try_db_write({"id": "j1"}, {"summary": "S"}, mock_supabase)
    mock_table.update.assert_called_with({"summary": "S"})

@patch("scripts.unified_post_processor.get_unified_processor")
@patch("scripts.unified_post_processor.supabase")
def test_process_jobs_unified_success(mock_supabase, mock_get_processor):
    mock_processor = mock_get_processor.return_value
    mock_processor.process_jobs.return_value = {
        "results": [{"summary": "S1", "values": ["V1"], "is_sse": True, "language": "en"}],
        "provider": "groq"
    }

    mock_jobs = [{"id": "j1", "summary": None, "values": None, "is_sse": None,
                  "sse_details": None, "language": None, "scraped_at": "2026-01-01T00:00:00"}]

    # _fetch_jobs without job_ids: .select().order().limit().execute()
    (mock_supabase.table.return_value
     .select.return_value
     .order.return_value
     .limit.return_value
     .execute.return_value.data) = mock_jobs

    res = process_jobs_unified(ProcessingOptions(task="all", limit=1))

    assert res["processed"] == 1
    assert res["updated"]["summary"] == 1
    assert res["provider_used"] == "groq"


@patch("scripts.unified_post_processor.get_unified_processor")
@patch("scripts.unified_post_processor.supabase")
def test_process_jobs_unified_skips_already_processed(mock_supabase, mock_get_processor):
    # Job already has all required fields filled
    mock_jobs = [{"id": "j1", "summary": "Done", "values": ["V1"], "is_sse": True,
                  "sse_details": "Done", "language": "en",
                  "scraped_at": "2026-01-01T00:00:00"}]

    (mock_supabase.table.return_value
     .select.return_value
     .order.return_value
     .limit.return_value
     .execute.return_value.data) = mock_jobs

    res = process_jobs_unified(ProcessingOptions(task="all"))
    assert res["processed"] == 0  # No jobs filtered for processing
    assert res["skipped"] == 1


@patch("scripts.unified_post_processor.get_unified_processor")
@patch("scripts.unified_post_processor.supabase")
def test_process_jobs_unified_batch_result_mismatch(mock_supabase, mock_get_processor):
    mock_processor = mock_get_processor.return_value
    mock_processor.process_jobs.return_value = {
        "results": [{"summary": "Only one"}],
        "provider": "groq",
    }

    mock_jobs = [
        {"id": "j1", "summary": None, "values": None, "is_sse": None, "language": None,
         "scraped_at": "2026-01-01T00:00:00"},
        {"id": "j2", "summary": None, "values": None, "is_sse": None, "language": None,
         "scraped_at": "2026-01-01T00:00:00"},
    ]

    (mock_supabase.table.return_value
     .select.return_value
     .order.return_value
     .limit.return_value
     .execute.return_value.data) = mock_jobs

    res = process_jobs_unified(ProcessingOptions(task="all", limit=2))

    assert res["processed"] == 0
    assert res["errors"] == 2


@patch("scripts.unified_post_processor.process_jobs_unified")
def test_main_cli(mock_process):
    mock_process.return_value = {
        "processed": 5,
        "skipped": 0,
        "provider_used": "groq",
        "updated": {"summary": 0, "values": 0, "sse": 0, "language": 0},
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
            args.since_days = None
            args.force_language_reprocess = False
            args.force_sse = False
            mock_args.return_value = args

            main()
            mock_process.assert_called_with(
                ProcessingOptions(
                    task="sse",
                    limit=5,
                    job_ids=[],
                    dry_run=False,
                    verbose=False,
                    since_days=None,
                    force_language_reprocess=False,
                    force_sse=False,
                )
            )
