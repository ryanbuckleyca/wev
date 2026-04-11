"""Tests that save_job returns (status, id) and that job_ids flow into post-processing."""
import pytest
from unittest.mock import MagicMock, patch


# ── save_job return value contract ────────────────────────────────────────────

def _make_job():
    return {
        "job_title": "Test Job",
        "organization": "Test Org",
        "listing_url": "https://example.com/jobs/test-job",
        "description": "A job description.",
        "date_posted": "2026-03-01",
        "location": "Montreal, QC",
    }


def _mock_supabase(inserted_id="abc-123", existing=None):
    """Return a mock supabase client."""
    mock = MagicMock()
    # _find_existing_job path: .table().select().or_().execute()
    find_resp = MagicMock()
    find_resp.data = [existing] if existing else []
    mock.table.return_value.select.return_value.or_.return_value.execute.return_value = find_resp
    # insert path: .table().insert().execute()
    insert_resp = MagicMock()
    insert_resp.data = [{"id": inserted_id}]
    mock.table.return_value.insert.return_value.execute.return_value = insert_resp
    # update path
    mock.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
    return mock


@patch("utils.db.is_truthy_env", return_value=False)
@patch("utils.db._find_existing_job", return_value=None)
@patch("utils.db._job_row", return_value={"job_title": "Test Job"})
@patch("utils.db.supabase")
def test_save_job_returns_tuple_on_insert(mock_sb, mock_row, mock_find, mock_env):
    mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": "new-uuid-123"}]
    )
    from utils.db import save_job
    status, job_id = save_job(_make_job(), "source-id")
    assert status == "added"
    assert job_id == "new-uuid-123"


@patch("utils.db.is_truthy_env", return_value=True)  # SHOULD_OVERRIDE_EXISTING=1
@patch("utils.db._find_existing_job", return_value={"id": "existing-uuid-456", "listing_url": "https://example.com/jobs/test-job"})
@patch("utils.db._build_update_row", return_value={})
@patch("utils.db.supabase")
def test_save_job_returns_tuple_on_update(mock_sb, mock_build, mock_find, mock_env):
    mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
    from utils.db import save_job
    status, job_id = save_job(_make_job(), "source-id")
    assert status == "updated"
    assert job_id == "existing-uuid-456"


@patch("utils.db.is_truthy_env", return_value=False)  # SHOULD_OVERRIDE_EXISTING=0
@patch("utils.db._find_existing_job", return_value={"id": "existing-uuid-456", "listing_url": "https://example.com/jobs/test-job"})
@patch("utils.db.supabase")
def test_save_job_returns_none_id_on_skip(mock_sb, mock_find, mock_env):
    from utils.db import save_job
    status, job_id = save_job(_make_job(), "source-id")
    assert status == "skipped"
    assert job_id is None


@patch("utils.db.supabase")
def test_save_job_returns_none_id_on_missing_fields(mock_sb):
    from utils.db import save_job
    status, job_id = save_job({"listing_url": "https://example.com/x"}, "source-id")
    assert status == "skipped"
    assert job_id is None


# ── job_ids collection in _process_jobs_for_source ────────────────────────────

@patch("scrape.add_url_dedup_variants")
@patch("scrape.log_scrape_run")
@patch("scrape.save_job")
def test_job_ids_collected_from_save_job(mock_save, mock_log, mock_dedup):
    """job_ids in the summary must contain the ids returned by save_job."""
    mock_save.side_effect = [
        ("added", "id-001"),
        ("added", "id-002"),
        ("skipped", None),
    ]

    jobs = [
        {"job_title": "Job 1", "listing_url": "https://example.com/1"},
        {"job_title": "Job 2", "listing_url": "https://example.com/2"},
        {"job_title": "Job 3", "listing_url": "https://example.com/3"},
    ]
    source = {"id": "src-1", "name": "Test Source"}
    existing_urls = set()

    import scrape
    # Temporarily disable DRY_RUN for this test
    original = scrape.DRY_RUN
    scrape.DRY_RUN = False
    try:
        result = scrape._process_jobs_for_source(jobs, source, existing_urls)
    finally:
        scrape.DRY_RUN = original

    assert result["job_ids"] == ["id-001", "id-002"]
    assert result["jobs_added"] == 2


@patch("scrape.add_url_dedup_variants")
@patch("scrape.log_scrape_run")
@patch("scrape.save_job")
def test_job_ids_empty_when_all_skipped(mock_save, mock_log, mock_dedup):
    """If all jobs are skipped, job_ids must be empty so post-processing is not triggered."""
    mock_save.return_value = ("skipped", None)

    jobs = [{"job_title": "Job", "listing_url": "https://example.com/1"}]
    source = {"id": "src-1", "name": "Test Source"}

    import scrape
    original = scrape.DRY_RUN
    scrape.DRY_RUN = False
    try:
        result = scrape._process_jobs_for_source(jobs, source, set())
    finally:
        scrape.DRY_RUN = original

    assert result["job_ids"] == []


# ── error return paths ────────────────────────────────────────────────────────

@patch("utils.db.is_truthy_env", return_value=False)
@patch("utils.db._find_existing_job", return_value=None)
@patch("utils.db._job_row", return_value={"job_title": "Test Job"})
@patch("utils.db.supabase")
def test_save_job_returns_error_on_non_constraint_insert_failure(mock_sb, mock_row, mock_find, mock_env):
    """A generic insert failure (not a constraint error) returns ('error', None)."""
    mock_sb.table.return_value.insert.return_value.execute.side_effect = Exception("connection timeout")
    from utils.db import save_job
    status, job_id = save_job(_make_job(), "source-id")
    assert status == "error"
    assert job_id is None


@patch("utils.db.is_truthy_env", return_value=False)
@patch("utils.db._build_update_row", return_value={})
@patch("utils.db._job_row", return_value={"job_title": "Test Job"})
@patch("utils.db.supabase")
def test_save_job_returns_error_when_recovery_update_also_fails(mock_sb, mock_row, mock_build, mock_env):
    """Insert fails with a constraint error, recovery lookup finds the row, but the update also fails — returns ('error', None).

    _find_existing_job is called twice: first as the initial existence check (returns None so we
    proceed to insert), then inside the insert error handler as the recovery lookup (returns a row).
    """
    # First call: initial existence check → no existing row, proceed to insert
    # Second call: recovery lookup after constraint error → finds the row
    recovery_row = {"id": "recovered-uuid", "listing_url": "https://example.com/jobs/test-job"}
    with patch("utils.db._find_existing_job", side_effect=[None, recovery_row]):
        mock_sb.table.return_value.insert.return_value.execute.side_effect = Exception("duplicate key value violates unique constraint")
        mock_sb.table.return_value.update.return_value.eq.return_value.execute.side_effect = Exception("update failed")
        from utils.db import save_job
        status, job_id = save_job(_make_job(), "source-id")
    assert status == "error"
    assert job_id is None


@patch("utils.db.is_truthy_env", return_value=False)
@patch("utils.db._find_existing_job", return_value=None)
@patch("utils.db._job_row", return_value={"job_title": "Test Job"})
@patch("utils.db.supabase")
def test_save_job_returns_error_when_constraint_error_but_no_recovery_row(mock_sb, mock_row, mock_find, mock_env):
    """Insert fails with a constraint error but recovery lookup finds nothing — returns ('error', None)."""
    mock_sb.table.return_value.insert.return_value.execute.side_effect = Exception("unique constraint violation")
    from utils.db import save_job
    status, job_id = save_job(_make_job(), "source-id")
    assert status == "error"
    assert job_id is None
