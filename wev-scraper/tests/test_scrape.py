import os
from unittest.mock import MagicMock, patch

import pytest

from scrape import ScraperOrchestrator, ScraperResults, initialize_runtime_env, main


def test_scraper_results_init():
    results = ScraperResults(is_dry_run=True, is_compare_only=False)
    assert results.is_dry_run is True
    assert results.is_compare_only is False
    assert results.summary == []

class MockResponse:
    def __init__(self, data):
        self.data = data

@patch("scrape.supabase")
def test_fetch_sources(mock_supabase):
    mock_supabase.table.return_value.select.return_value.execute.return_value = MockResponse([{"id": "s1", "name": "Source 1"}])
    orchestrator = ScraperOrchestrator()
    sources = orchestrator._fetch_sources()
    assert len(sources) == 1
    assert sources[0]["id"] == "s1"


@patch("scrape.supabase")
def test_fetch_sources_exact_name_match(mock_supabase):
    mock_supabase.table.return_value.select.return_value.execute.return_value = MockResponse(
        [
            {"id": "s1", "name": "GoodWork"},
            {"id": "s2", "name": "GoodWork Canada"},
        ]
    )
    orchestrator = ScraperOrchestrator(source_filter="goodwork")
    sources = orchestrator._fetch_sources()
    assert len(sources) == 1
    assert sources[0]["id"] == "s1"


@patch("scrape.supabase")
def test_fetch_sources_no_partial_match(mock_supabase):
    mock_supabase.table.return_value.select.return_value.execute.return_value = MockResponse(
        [{"id": "s2", "name": "GoodWork Canada"}]
    )
    orchestrator = ScraperOrchestrator(source_filter="goodwork")
    with pytest.raises(RuntimeError, match="No source found matching"):
        orchestrator._fetch_sources()

@patch("scrape.supabase")
def test_fetch_sources_empty(mock_supabase):
    mock_supabase.table.return_value.select.return_value.execute.return_value = MockResponse([])
    orchestrator = ScraperOrchestrator()
    with pytest.raises(RuntimeError, match="Could not fetch sources"):
        orchestrator._fetch_sources()

@patch("scrape.fetch_all_rows")
def test_fetch_existing_job_urls(mock_fetch):
    mock_fetch.return_value = [{"listing_url": "https://example.com/job1"}]
    orchestrator = ScraperOrchestrator()
    urls = orchestrator._fetch_existing_job_urls()
    assert "https://example.com/job1" in urls

@patch("scrape.get_scraper_class")
def test_process_single_source_no_class(mock_get_class):
    mock_get_class.return_value = None
    orchestrator = ScraperOrchestrator()
    orchestrator._process_single_source({"id": "s1", "name": "S1"})
    assert len(orchestrator.results.summary) == 0

@patch("scrape.get_scraper_class")
def test_process_single_source_success(mock_get_class):
    mock_scraper_class = MagicMock()
    mock_scraper = mock_scraper_class.return_value
    mock_scraper.fetch_jobs.return_value = [{"job_title": "Job 1"}]
    mock_get_class.return_value = mock_scraper_class

    orchestrator = ScraperOrchestrator(dry_run=True)
    orchestrator._process_single_source({"id": "s1", "name": "S1"})

    assert len(orchestrator.results.summary) == 1
    assert orchestrator.results.summary[0]["source"] == "S1"
    assert orchestrator.results.summary[0]["jobs_found"] == 1

@patch("scrape.save_job")
@patch("scrape.log_scrape_run")
def test_save_or_compare_jobs_live(mock_log, mock_save):
    mock_save.return_value = ("added", "job-1")
    orchestrator = ScraperOrchestrator()
    source = {"id": "s1", "name": "S1"}
    jobs = [{"listing_url": "url1"}]

    res = orchestrator._save_or_compare_jobs(jobs, source)
    assert res["jobs_added"] == 1
    assert res["job_ids"] == ["job-1"]
    mock_log.assert_called_with("s1", 1, 1)

def test_compare_fields():
    orchestrator = ScraperOrchestrator()
    job = {"job_title": "New Title", "location": "Montreal"}
    db_row = {"job_title": "Old Title", "location": "Montreal"}
    diffs = orchestrator._compare_fields(job, db_row)
    assert "job_title" in diffs
    assert diffs["job_title"]["scraped"] == "New Title"
    assert "location" not in diffs

@patch("scrape.is_truthy_env", return_value=True)
def test_run_post_scrape_tasks(mock_env):
    from scripts.unified_post_processor import ProcessingOptions

    orchestrator = ScraperOrchestrator()
    orchestrator.results.all_job_ids = ["j1", "j2"]

    with patch("scripts.unified_post_processor.process_jobs_unified") as mock_process:
        orchestrator._run_post_scrape_tasks()
        mock_process.assert_called_once()
        opts = mock_process.call_args[0][0]
        assert isinstance(opts, ProcessingOptions)
        assert opts.job_ids == ["j1", "j2"]

@patch("scrape.ensure_env_loaded")
@patch("scrape.Path.exists", return_value=True)
def test_initialize_runtime_env_staging(mock_exists, mock_load):
    args = MagicMock()
    args.staging = True
    args.prod = False
    args.publish = False

    with patch("scrape.load_env_file") as mock_load_file:
        initialize_runtime_env(args)
        assert mock_load_file.called

@patch("scrape.supabase")
def test_fetch_db_jobs_for_source(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MockResponse([
        {"listing_url": "https://example.com/j1", "job_title": "Job 1"}
    ])
    orchestrator = ScraperOrchestrator()
    db_jobs = orchestrator._fetch_db_jobs_for_source("s1")
    assert "https://example.com/j1" in db_jobs
    assert db_jobs["https://example.com/j1"]["job_title"] == "Job 1"

@patch("scrape.supabase")
def test_fetch_db_jobs_for_source_empty(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MockResponse([])
    orchestrator = ScraperOrchestrator()
    db_jobs = orchestrator._fetch_db_jobs_for_source("s1")
    assert db_jobs == {}

@patch("scrape.normalize_listing_url", side_effect=lambda x: x)
def test_run_compare_dry_run(mock_norm):
    orchestrator = ScraperOrchestrator(dry_run=True, compare_only=True)
    with patch.object(orchestrator, "_fetch_db_jobs_for_source") as mock_fetch_db:
        mock_fetch_db.return_value = {
            "url1": {"job_title": "Old Title", "listing_url": "url1"}
        }
        jobs = [
            {"job_title": "New Title", "listing_url": "url1"},
            {"job_title": "New Job", "listing_url": "url2"}
        ]
        res = orchestrator._run_compare_dry_run(jobs, {"id": "s1", "name": "S1"})
        assert res["jobs_found"] == 2
        assert res["new"] == 1
        assert res["source"] == "S1"

def test_handle_fatal_error():
    orchestrator = ScraperOrchestrator()
    with patch("scrape._log") as mock_log:
        with pytest.raises(SystemExit) as e:
            orchestrator._handle_fatal_error(Exception("Fatal!"))
        assert e.value.code == 1
        mock_log.assert_any_call("❌ FATAL ERROR: Fatal!")

def test_handle_source_error():
    orchestrator = ScraperOrchestrator()
    mock_scraper = MagicMock()
    with patch("scrape._log") as mock_log:
        orchestrator._handle_source_error(Exception("Source Error"), mock_scraper, "S1")
        mock_log.assert_any_call("❌ Error scraping S1: Source Error")

def test_cleanup_scraper():
    orchestrator = ScraperOrchestrator()
    mock_scraper = MagicMock()
    orchestrator._cleanup_scraper(mock_scraper)
    mock_scraper.close_browser.assert_called_once()

    # Should not crash if scraper is None
    orchestrator._cleanup_scraper(None)

@patch("scrape.is_truthy_env", return_value=False)
def test_log_tagging_status_disabled(mock_env):
    orchestrator = ScraperOrchestrator()
    with patch("scrape._log") as mock_log:
        orchestrator._log_tagging_status("VAR", "Label", "RE_VAR")
        mock_log.assert_called_with("Label: disabled")

@patch("scrape.initialize_runtime_env")
@patch("scrape.ScraperOrchestrator")
def test_main_flow(mock_orch_class, mock_init):
    mock_orch = mock_orch_class.return_value
    with patch("scrape.parse_args") as mock_args:
        args = MagicMock()
        args.prod = False
        args.publish = False
        args.dry_run = True
        args.compare = False
        args.provider = "groq"
        args.max_jobs = 5
        args.headed = True
        args.vpn = True
        args.list_sources = False
        mock_args.return_value = args

        main()

        assert os.environ["LLM_PROVIDER"] == "groq"
        assert os.environ["MAX_JOBS_PER_SOURCE"] == "5"
        assert os.environ["SCRAPER_HEADED"] == "1"
        assert os.environ["SCRAPER_VPN_MODE"] == "1"
        mock_orch.run.assert_called_once()


@patch("scrape.initialize_runtime_env")
@patch("scrape.ScraperOrchestrator")
def test_main_vpn_does_not_force_headed_mode(mock_orch_class, mock_init, monkeypatch):
    monkeypatch.delenv("SCRAPER_HEADED", raising=False)
    mock_orch = mock_orch_class.return_value
    with patch("scrape.parse_args") as mock_args:
        args = MagicMock()
        args.prod = False
        args.publish = False
        args.dry_run = True
        args.compare = False
        args.provider = None
        args.max_jobs = None
        args.headed = False
        args.vpn = True
        args.list_sources = False
        mock_args.return_value = args

        main()

        assert "SCRAPER_HEADED" not in os.environ
        assert os.environ["SCRAPER_VPN_MODE"] == "1"
        mock_orch.run.assert_called_once()


@patch("scrape.initialize_runtime_env")
@patch("scrape.ScraperOrchestrator")
def test_main_prod_confirmation_propagates_to_child_scripts(mock_orch_class, mock_init, monkeypatch):
    monkeypatch.setenv("PROD_CONFIRMED", "1")
    monkeypatch.delenv("CONFIRM_PROD_RUN", raising=False)
    mock_orch = mock_orch_class.return_value

    with patch("scrape.parse_args") as mock_args:
        args = MagicMock()
        args.prod = True
        args.publish = False
        args.dry_run = False
        args.compare = False
        args.provider = None
        args.max_jobs = None
        args.headed = False
        args.vpn = False
        args.list_sources = False
        mock_args.return_value = args

        main()

        assert os.environ["USE_PROD_DB"] == "1"
        assert os.environ["PROD_CONFIRMED"] == "1"
        assert os.environ["CONFIRM_PROD_RUN"] == "YES"
        mock_orch.run.assert_called_once()


@patch("scrape.initialize_runtime_env")
@patch("scrape.ScraperOrchestrator")
def test_main_prod_noninteractive_requires_confirmation(mock_orch_class, mock_init, monkeypatch):
    monkeypatch.delenv("PROD_CONFIRMED", raising=False)
    monkeypatch.delenv("CONFIRM_PROD_RUN", raising=False)

    with patch("scrape.parse_args") as mock_args, patch("sys.stdin.isatty", return_value=False):
        args = MagicMock()
        args.prod = True
        args.publish = False
        args.dry_run = False
        args.compare = False
        args.provider = None
        args.max_jobs = None
        args.headed = False
        args.vpn = False
        args.list_sources = False
        mock_args.return_value = args

        with pytest.raises(SystemExit) as exc:
            main()

        assert exc.value.code == 1
        mock_orch_class.assert_not_called()
