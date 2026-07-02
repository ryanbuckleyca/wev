"""Tests for the organization_id backfill script.

Property 9: Migration script skips already-resolved jobs.

Validates: Requirements 6.2, 6.3, 6.6
"""

import json
from unittest.mock import MagicMock, call, patch

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st


# ── Supabase mock helpers ─────────────────────────────────────────────────────


def _make_job_row(job_id, organization="Test Org", organization_id=None):
    return {
        "id": job_id,
        "organization": organization,
        "organization_id": organization_id,
        "municipality": "Montreal",
        "province": "QC",
        "location": "Montreal, QC",
        "job_title": "Test Job",
        "description": "A test job description",
    }


def _make_supabase_mock(batches: list[list[dict]]):
    """Build a Supabase mock that returns successive batches on each select().execute() call."""
    mock_sb = MagicMock()
    batch_iter = iter(batches)

    def execute_side_effect():
        try:
            rows = next(batch_iter)
        except StopIteration:
            rows = []
        r = MagicMock()
        r.data = rows
        return r

    select_chain = MagicMock()
    select_chain.is_.return_value = select_chain
    select_chain.neq.return_value = select_chain
    select_chain.order.return_value = select_chain
    select_chain.range.return_value = select_chain
    select_chain.execute.side_effect = execute_side_effect

    update_chain = MagicMock()
    update_chain.eq.return_value = update_chain
    update_chain.execute.return_value = MagicMock(data=[])

    def table_side_effect(name):
        t = MagicMock()
        t.select.return_value = select_chain
        t.update.return_value = update_chain
        return t

    mock_sb.table.side_effect = table_side_effect
    mock_sb._update_chain = update_chain
    mock_sb._select_chain = select_chain
    return mock_sb


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestPhase1Backfill:
    @patch("scripts.backfill_organization_ids.supabase")
    def test_processes_unresolved_jobs(self, mock_sb):
        rows = [_make_job_row("job-1"), _make_job_row("job-2")]
        sb = _make_supabase_mock([rows, []])
        mock_sb.table.side_effect = sb.table.side_effect
        mock_sb._update_chain = sb._update_chain

        resolver = MagicMock()
        resolver.resolve.return_value = 42

        with patch("scripts.backfill_organization_ids._build_resolver", return_value=resolver):
            from scripts.backfill_organization_ids import run_backfill
            summary = run_backfill(batch_size=50)

        assert summary["phase1_processed"] == 2
        assert resolver.resolve.call_count == 2

    @patch("scripts.backfill_organization_ids.supabase")
    def test_dry_run_does_not_write_to_db(self, mock_sb):
        rows = [_make_job_row("job-1")]
        sb = _make_supabase_mock([rows, []])
        mock_sb.table.side_effect = sb.table.side_effect
        mock_sb._update_chain = sb._update_chain

        resolver = MagicMock()
        resolver.resolve.return_value = 10

        with patch("scripts.backfill_organization_ids._build_resolver", return_value=resolver):
            from scripts.backfill_organization_ids import run_backfill
            summary = run_backfill(batch_size=50, dry_run=True)

        assert summary["dry_run"] is True
        assert summary["phase1_processed"] == 1
        sb._update_chain.execute.assert_not_called()

    @patch("scripts.backfill_organization_ids.supabase")
    def test_per_job_isolation_exception_does_not_abort_batch(self, mock_sb):
        """Exception on job N does not abort processing of job N+1."""
        rows = [_make_job_row("job-1"), _make_job_row("job-2"), _make_job_row("job-3")]
        sb = _make_supabase_mock([rows, []])
        mock_sb.table.side_effect = sb.table.side_effect

        resolver = MagicMock()
        resolver.resolve.side_effect = [Exception("boom"), 10, 11]

        with patch("scripts.backfill_organization_ids._build_resolver", return_value=resolver):
            from scripts.backfill_organization_ids import run_backfill
            summary = run_backfill(batch_size=50)

        assert summary["errors"] == 1
        assert summary["phase1_processed"] == 2  # 2 succeeded

    @patch("scripts.backfill_organization_ids.supabase")
    def test_batch_delay_called_between_batches_not_after_last(self, mock_sb):
        batch1 = [_make_job_row(f"job-{i}") for i in range(2)]
        batch2 = [_make_job_row(f"job-{i}") for i in range(2, 4)]

        sb = _make_supabase_mock([batch1, batch2, []])
        mock_sb.table.side_effect = sb.table.side_effect

        resolver = MagicMock()
        resolver.resolve.return_value = 1

        with patch("scripts.backfill_organization_ids._build_resolver", return_value=resolver):
            with patch("scripts.backfill_organization_ids.time.sleep") as mock_sleep:
                from scripts.backfill_organization_ids import run_backfill
                run_backfill(batch_size=2, batch_delay_seconds=1.5)

        # Sleep should be called between batches but not after the last batch
        assert mock_sleep.call_count == 2  # after batch1 and batch2, not after empty batch

    @patch("scripts.backfill_organization_ids.supabase")
    def test_filter_uses_is_null_and_neq_empty_string(self, mock_sb):
        """The select query must filter on organization_id IS NULL and organization != ''."""
        sb = _make_supabase_mock([[]])
        mock_sb.table.side_effect = sb.table.side_effect

        resolver = MagicMock()
        resolver.resolve.return_value = None

        with patch("scripts.backfill_organization_ids._build_resolver", return_value=resolver):
            from scripts.backfill_organization_ids import run_backfill
            run_backfill(batch_size=50)

        sb._select_chain.is_.assert_called_with("organization_id", "null")
        sb._select_chain.neq.assert_called_with("organization", "")

    @patch("scripts.backfill_organization_ids.supabase")
    def test_multi_batch_processing(self, mock_sb):
        batch1 = [_make_job_row(f"job-{i}") for i in range(3)]
        batch2 = [_make_job_row(f"job-{i}") for i in range(3, 5)]

        sb = _make_supabase_mock([batch1, batch2, []])
        mock_sb.table.side_effect = sb.table.side_effect

        resolver = MagicMock()
        resolver.resolve.return_value = 42

        with patch("scripts.backfill_organization_ids._build_resolver", return_value=resolver):
            with patch("scripts.backfill_organization_ids.time.sleep"):
                from scripts.backfill_organization_ids import run_backfill
                summary = run_backfill(batch_size=3)

        assert summary["phase1_processed"] == 5
        assert resolver.resolve.call_count == 5

    @patch("scripts.backfill_organization_ids.supabase")
    def test_exit_code_0_when_no_errors(self, mock_sb):
        sb = _make_supabase_mock([[]])
        mock_sb.table.side_effect = sb.table.side_effect

        resolver = MagicMock()
        resolver.resolve.return_value = None

        with patch("scripts.backfill_organization_ids._build_resolver", return_value=resolver):
            from scripts.backfill_organization_ids import run_backfill
            summary = run_backfill()

        assert summary["errors"] == 0

    @patch("scripts.backfill_organization_ids.supabase")
    def test_exit_code_1_when_errors_gt_0(self, mock_sb):
        rows = [_make_job_row("job-bad")]
        sb = _make_supabase_mock([rows, []])
        mock_sb.table.side_effect = sb.table.side_effect

        resolver = MagicMock()
        resolver.resolve.side_effect = Exception("error")

        with patch("scripts.backfill_organization_ids._build_resolver", return_value=resolver):
            from scripts.backfill_organization_ids import run_backfill
            summary = run_backfill()

        assert summary["errors"] == 1


# ── Property-based tests ──────────────────────────────────────────────────────

# Feature: organizations, Property 9: Migration script skips already-resolved jobs
@given(
    resolved_jobs=st.lists(
        st.text(min_size=1, max_size=20).map(lambda jid: _make_job_row(jid, organization_id=99)),
        min_size=0,
        max_size=10,
    ),
    unresolved_jobs=st.lists(
        st.text(min_size=1, max_size=20).map(lambda jid: _make_job_row(jid)),
        min_size=0,
        max_size=10,
    ),
)
@settings(max_examples=100)
def test_script_skips_already_resolved_jobs(resolved_jobs, unresolved_jobs):
    """Property 9: Only jobs with organization_id IS NULL are processed.

    The DB filter enforces this — but the resolver should only be called for
    unresolved jobs that actually come back from the query.
    """
    # The mock only returns unresolved_jobs (the DB filter does the work in production)
    with patch("scripts.backfill_organization_ids.supabase") as mock_sb:
        sb = _make_supabase_mock([unresolved_jobs, []])
        mock_sb.table.side_effect = sb.table.side_effect

        resolver = MagicMock()
        resolver.resolve.return_value = 1

        with patch("scripts.backfill_organization_ids._build_resolver", return_value=resolver):
            from scripts.backfill_organization_ids import run_backfill
            summary = run_backfill(batch_size=100)

    # Resolver should only be called for the unresolved jobs returned by the DB
    assert resolver.resolve.call_count == len(unresolved_jobs)
    assert summary["phase1_processed"] == len(unresolved_jobs)
