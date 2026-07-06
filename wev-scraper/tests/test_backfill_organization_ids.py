"""Tests for the organization_id backfill script.

Validates: Requirements 6.2, 6.3, 6.6
"""

from unittest.mock import MagicMock, patch

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

# ── Helpers ───────────────────────────────────────────────────────────────────


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


def _make_mock_supabase(batches):
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
    select_chain.gt.return_value = select_chain
    select_chain.limit.return_value = select_chain
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


# ── Fixture (patches only, no mock wiring) ────────────────────────────────────


@pytest.fixture
def backfill_env():
    resolver = MagicMock()
    with patch("utils.db.supabase") as mock_sb:
        with patch("utils.organization_resolver.create_resolver", return_value=resolver):
            from scripts.backfill_organization_ids import run_backfill
            yield _BackfillEnv(mock_sb=mock_sb, resolver=resolver, run_backfill=run_backfill)


class _BackfillEnv:
    def __init__(self, mock_sb, resolver, run_backfill):
        self.mock_sb = mock_sb
        self.resolver = resolver
        self.run_backfill = run_backfill


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestPhase1Backfill:
    def test_processes_unresolved_jobs(self, backfill_env):
        rows = [_make_job_row("job-1"), _make_job_row("job-2")]
        sb = _make_mock_supabase([rows, []])
        backfill_env.mock_sb.table.side_effect = sb.table.side_effect
        backfill_env.mock_sb._update_chain = sb._update_chain
        backfill_env.resolver.resolve.return_value = 42

        summary = backfill_env.run_backfill(batch_size=50)

        assert summary["phase1_processed"] == 2
        assert summary["orgs_resolved"] == 2
        assert summary["unresolved"] == 0
        assert backfill_env.resolver.resolve.call_count == 2

    def test_dry_run_does_not_write_to_db(self, backfill_env):
        rows = [_make_job_row("job-1")]
        sb = _make_mock_supabase([rows, []])
        backfill_env.mock_sb.table.side_effect = sb.table.side_effect
        backfill_env.mock_sb._update_chain = sb._update_chain
        backfill_env.resolver.resolve.return_value = 10

        summary = backfill_env.run_backfill(batch_size=50, dry_run=True)

        assert summary["dry_run"] is True
        assert summary["phase1_processed"] == 1
        assert summary["orgs_resolved"] == 1
        assert summary["unresolved"] == 0
        backfill_env.mock_sb._update_chain.execute.assert_not_called()

    def test_per_job_isolation_exception_does_not_abort_batch(self, backfill_env):
        rows = [_make_job_row("job-1"), _make_job_row("job-2"), _make_job_row("job-3")]
        sb = _make_mock_supabase([rows, []])
        backfill_env.mock_sb.table.side_effect = sb.table.side_effect
        backfill_env.resolver.resolve.side_effect = [Exception("boom"), 10, 11]

        summary = backfill_env.run_backfill(batch_size=50)

        assert summary["errors"] == 1
        assert summary["orgs_resolved"] == 2
        assert summary["unresolved"] == 0
        assert summary["phase1_processed"] == 2

    def test_batch_delay_called_between_batches_not_after_last(self, backfill_env):
        batch1 = [_make_job_row(f"job-{i}") for i in range(2)]
        batch2 = [_make_job_row(f"job-{i}") for i in range(2, 4)]

        sb = _make_mock_supabase([batch1, batch2, []])
        backfill_env.mock_sb.table.side_effect = sb.table.side_effect
        backfill_env.resolver.resolve.return_value = 1

        with patch("scripts.backfill_organization_ids.time.sleep") as mock_sleep:
            backfill_env.run_backfill(batch_size=2, batch_delay_seconds=1.5)

        assert mock_sleep.call_count == 2

    def test_filter_uses_is_null_and_neq_empty_string(self, backfill_env):
        sb = _make_mock_supabase([[]])
        backfill_env.mock_sb.table.side_effect = sb.table.side_effect
        backfill_env.resolver.resolve.return_value = None

        backfill_env.run_backfill(batch_size=50)

        sb._select_chain.is_.assert_called_with("organization_id", "null")
        sb._select_chain.neq.assert_called_with("organization", "")

    def test_multi_batch_processing(self, backfill_env):
        batch1 = [_make_job_row(f"job-{i}") for i in range(3)]
        batch2 = [_make_job_row(f"job-{i}") for i in range(3, 5)]

        sb = _make_mock_supabase([batch1, batch2, []])
        backfill_env.mock_sb.table.side_effect = sb.table.side_effect
        backfill_env.resolver.resolve.return_value = 42

        with patch("scripts.backfill_organization_ids.time.sleep"):
            summary = backfill_env.run_backfill(batch_size=3)

        assert summary["phase1_processed"] == 5
        assert summary["orgs_resolved"] == 5
        assert summary["unresolved"] == 0
        assert backfill_env.resolver.resolve.call_count == 5

    def test_exit_code_0_when_no_errors(self, backfill_env):
        sb = _make_mock_supabase([[]])
        backfill_env.mock_sb.table.side_effect = sb.table.side_effect
        backfill_env.resolver.resolve.return_value = None

        summary = backfill_env.run_backfill()

        assert summary["errors"] == 0
        assert summary["orgs_resolved"] == 0
        assert summary["unresolved"] == 0

    def test_exit_code_1_when_errors_gt_0(self, backfill_env):
        rows = [_make_job_row("job-bad")]
        sb = _make_mock_supabase([rows, []])
        backfill_env.mock_sb.table.side_effect = sb.table.side_effect
        backfill_env.resolver.resolve.side_effect = Exception("error")

        summary = backfill_env.run_backfill()

        assert summary["errors"] == 1
        assert summary["unresolved"] == 0

    def test_unresolved_counter_incremented_when_resolver_returns_none(self, backfill_env):
        rows = [_make_job_row("job-1"), _make_job_row("job-2")]
        sb = _make_mock_supabase([rows, []])
        backfill_env.mock_sb.table.side_effect = sb.table.side_effect
        backfill_env.resolver.resolve.return_value = None

        summary = backfill_env.run_backfill()

        assert summary["orgs_resolved"] == 0
        assert summary["unresolved"] == 2
        assert summary["phase1_processed"] == 2


# ── Property-based tests ──────────────────────────────────────────────────────


@given(
    unresolved_jobs=st.lists(
        st.text(min_size=1, max_size=20).map(lambda jid: _make_job_row(jid)),
        min_size=0,
        max_size=10,
    ),
)
@settings(max_examples=100, deadline=None)
def test_script_processes_only_unresolved_jobs(unresolved_jobs):
    """The resolver is called exactly once per job returned by the DB query."""
    mock_sb = _make_mock_supabase([unresolved_jobs, []])

    resolver = MagicMock()
    resolver.resolve.return_value = 1

    with patch("utils.db.supabase", mock_sb):
        with patch("utils.organization_resolver.create_resolver", return_value=resolver):
            from scripts.backfill_organization_ids import run_backfill
            summary = run_backfill(batch_size=100)

    assert resolver.resolve.call_count == len(unresolved_jobs)
    assert summary["phase1_processed"] == len(unresolved_jobs)
    assert summary["unresolved"] == 0


# ── Phase 2 SSE Backfill Tests ────────────────────────────────────────────────


def _make_unrated_org(org_id=1, name="Test Org"):
    return {
        "id": org_id,
        "name": name,
        "description": "desc",
        "type": "nonprofit",
        "website": None,
        "values": None,
    }

class TestPhase2SSEBackfill:
    _ASSESS_RETURN = {
        "description": "desc",
        "mission_statement": None,
        "type": "nonprofit",
        "values": "values",
        "values_list": ["Advancement"],
        "values_rated": [{"value": "Advancement", "rank": 1}],
        "sse_rating": "strong_yes",
        "is_sse": True,
        "sse_details": {"confidence": 0.9, "reasoning": "Ok"},
    }

    def test_processes_unrated_orgs(self):
        repo_mock = MagicMock()
        repo_mock.fetch_unrated_orgs.side_effect = [
            [_make_unrated_org(1), _make_unrated_org(2)],
            [],
        ]
        assessor_mock = MagicMock()
        assessor_mock.assess_and_build_update.return_value = self._ASSESS_RETURN

        with patch("utils.organization_repository.OrganizationRepository", return_value=repo_mock), \
             patch("utils.organization_assessment.OrganizationAssessor", return_value=assessor_mock):
            from scripts.backfill_organization_ids import run_sse_backfill
            summary = run_sse_backfill(batch_size=50)

        assert summary["phase2_classified"] == 2
        assert summary["phase2_errors"] == 0
        assert assessor_mock.assess_and_build_update.call_count == 2
        assert repo_mock.update_org.call_count == 2

    def test_dry_run_does_not_update_db(self):
        repo_mock = MagicMock()
        repo_mock.fetch_unrated_orgs.side_effect = [[_make_unrated_org(1)], []]
        assessor_mock = MagicMock()
        assessor_mock.assess_and_build_update.return_value = self._ASSESS_RETURN

        with patch("utils.organization_repository.OrganizationRepository", return_value=repo_mock), \
             patch("utils.organization_assessment.OrganizationAssessor", return_value=assessor_mock):
            from scripts.backfill_organization_ids import run_sse_backfill
            summary = run_sse_backfill(batch_size=50, dry_run=True)

        assert summary["phase2_classified"] == 1
        assert summary["dry_run"] is True
        repo_mock.update_org.assert_not_called()

    def test_per_org_isolation_exception_does_not_abort_batch(self):
        repo_mock = MagicMock()
        repo_mock.fetch_unrated_orgs.side_effect = [
            [_make_unrated_org(1), _make_unrated_org(2), _make_unrated_org(3)],
            [],
        ]
        assessor_mock = MagicMock()
        assessor_mock.assess_and_build_update.side_effect = [
            Exception("boom"),
            self._ASSESS_RETURN,
            Exception("boom2"),
        ]

        with patch("utils.organization_repository.OrganizationRepository", return_value=repo_mock), \
             patch("utils.organization_assessment.OrganizationAssessor", return_value=assessor_mock):
            from scripts.backfill_organization_ids import run_sse_backfill
            summary = run_sse_backfill(batch_size=50)

        assert summary["phase2_errors"] == 2
        assert summary["phase2_classified"] == 1
        assert repo_mock.update_org.call_count == 1


@given(
    unrated_orgs=st.lists(
        st.integers(min_value=1, max_value=1000).map(lambda oid: _make_unrated_org(oid)),
        min_size=0,
        max_size=10,
    ),
)
@settings(max_examples=100, deadline=None)
def test_script_processes_only_unrated_orgs(unrated_orgs):
    """Property 8: SSE backfill idempotency.
    The classifier is called exactly once per org returned by fetch_unrated_orgs,
    proving that if fetch_unrated_orgs only yields null-rated orgs, already-rated
    orgs are never classified.
    """
    repo_mock = MagicMock()
    repo_mock.fetch_unrated_orgs.side_effect = [unrated_orgs, []]
    
    assessor_mock = MagicMock()
    assessor_mock.assess_and_build_update.return_value = {
        "sse_rating": "no", "is_sse": False, "sse_details": {"confidence": 0.5},
    }

    with patch("utils.organization_repository.OrganizationRepository", return_value=repo_mock), \
         patch("utils.organization_assessment.OrganizationAssessor", return_value=assessor_mock):
        from scripts.backfill_organization_ids import run_sse_backfill
        summary = run_sse_backfill(batch_size=100)

    assert assessor_mock.assess_and_build_update.call_count == len(unrated_orgs)
    assert summary["phase2_classified"] == len(unrated_orgs)
    assert summary["phase2_errors"] == 0
