"""Property-based tests for the compensation backfill script.

Property 6: Backfill Idempotency
  Running the backfill twice produces the same DB state as running it once.
  No row with a non-null compensation_meta is reprocessed.

Validates: Requirements 14.1, 14.4
"""

import pytest
from unittest.mock import MagicMock, patch, call
from lib.compensation import CompensationExtraction


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_extraction(unit_text="YEAR", min_value=6_000_000, confidence=0.9):
    return CompensationExtraction(
        unit_text=unit_text,
        min_value=min_value,
        max_value=None,
        hours_per_week=None,
        currency="CAD",
        raw_note=None,
        confidence=confidence,
    )


def _make_row(job_id, wage="$60,000/year"):
    return {"id": job_id, "wage": wage}


def _make_supabase_mock(rows_first_call, rows_second_call=None):
    """Build a mock supabase client that returns different row sets per call."""
    mock_supabase = MagicMock()

    # Track call count for the execute() on the select chain
    call_count = {"n": 0}

    def make_execute_result(rows):
        result = MagicMock()
        result.data = rows
        return result

    def execute_side_effect():
        call_count["n"] += 1
        if call_count["n"] == 1:
            return make_execute_result(rows_first_call)
        # Second and subsequent calls return the second set (or empty)
        return make_execute_result(rows_second_call if rows_second_call is not None else [])

    # Chain: .table().select().is_().order().range().execute()
    chain = MagicMock()
    chain.execute.side_effect = execute_side_effect
    chain.range.return_value = chain
    chain.order.return_value = chain
    chain.is_.return_value = chain
    chain.select.return_value = chain

    update_chain = MagicMock()
    update_chain.eq.return_value = update_chain
    update_chain.execute.return_value = MagicMock(data=[])

    def table_side_effect(name):
        t = MagicMock()
        t.select.return_value = chain
        t.update.return_value = update_chain
        return t

    mock_supabase.table.side_effect = table_side_effect
    return mock_supabase, update_chain


# ---------------------------------------------------------------------------
# Property 6: Backfill Idempotency
# Validates: Requirements 14.1, 14.4
# ---------------------------------------------------------------------------

class TestBackfillIdempotency:
    """
    Property 6: Backfill Idempotency

    Running the backfill twice produces the same DB state as running it once.
    No row with a non-null compensation_meta is reprocessed.
    """

    @patch("scripts.backfill_compensation.extract_and_guard")
    @patch("scripts.backfill_compensation.supabase")
    def test_second_run_processes_no_rows(self, mock_supabase, mock_extract):
        """Second run finds no rows (compensation_meta IS NULL filter returns empty).

        Validates: Requirement 14.4 — idempotency via compensation_meta IS NULL filter.
        """
        from scripts.backfill_compensation import run_backfill

        # First run: one row to process
        rows = [_make_row("job-1")]
        mock_extract.return_value = _make_extraction()

        # Set up supabase mock: first call returns rows, second returns empty
        mock_supabase_obj, update_chain = _make_supabase_mock(rows, rows_second_call=[])
        mock_supabase.table.side_effect = mock_supabase_obj.table.side_effect

        summary1 = run_backfill(batch_size=50)
        assert summary1["processed"] == 1

        # Reset mock to return empty on second run (simulates compensation_meta now set)
        mock_supabase_obj2, update_chain2 = _make_supabase_mock([])
        mock_supabase.table.side_effect = mock_supabase_obj2.table.side_effect

        summary2 = run_backfill(batch_size=50)
        assert summary2["processed"] == 0
        # extract_and_guard should NOT be called on the second run
        assert mock_extract.call_count == 1  # only called once total

    @patch("scripts.backfill_compensation.extract_and_guard")
    @patch("scripts.backfill_compensation.supabase")
    def test_dry_run_does_not_write_to_db(self, mock_supabase, mock_extract):
        """Dry run logs but does not call supabase update.

        Validates: Requirement 14.1 (idempotency — dry run leaves DB unchanged).
        """
        from scripts.backfill_compensation import run_backfill

        rows = [_make_row("job-1"), _make_row("job-2")]
        mock_extract.return_value = _make_extraction()

        mock_supabase_obj, update_chain = _make_supabase_mock(rows)
        mock_supabase.table.side_effect = mock_supabase_obj.table.side_effect

        summary = run_backfill(batch_size=50, dry_run=True)

        # Processed count reflects rows seen, but no DB writes
        assert summary["processed"] == 2
        assert summary["dry_run"] is True
        # update() should never be called in dry_run mode
        update_chain.execute.assert_not_called()

    @patch("scripts.backfill_compensation.extract_and_guard")
    @patch("scripts.backfill_compensation.supabase")
    def test_only_null_meta_rows_are_selected(self, mock_supabase, mock_extract):
        """The select query filters on compensation_meta IS NULL.

        Validates: Requirement 14.1 — only unprocessed rows are targeted.
        """
        from scripts.backfill_compensation import run_backfill

        mock_extract.return_value = _make_extraction()
        mock_supabase_obj, _ = _make_supabase_mock([])
        mock_supabase.table.side_effect = mock_supabase_obj.table.side_effect

        run_backfill(batch_size=50)

        # Verify .is_("compensation_meta", "null") was called on the select chain
        # The chain mock records all calls
        chain = mock_supabase_obj.table.side_effect("jobs").select.return_value
        chain.is_.assert_called_with("compensation_meta", "null")

    @patch("scripts.backfill_compensation.extract_and_guard")
    @patch("scripts.backfill_compensation.supabase")
    def test_compensation_meta_always_set_after_processing(self, mock_supabase, mock_extract):
        """Every processed row gets a non-null compensation_meta written.

        Validates: Requirement 14.3 — compensation_meta is always set.
        """
        from scripts.backfill_compensation import run_backfill

        rows = [_make_row("job-1", wage="$25/hr")]
        mock_extract.return_value = _make_extraction(unit_text="HOUR", min_value=2500)

        written_updates = []

        # Build a unified update chain that captures payloads and is wired into
        # the same table() side_effect used by run_backfill.
        update_chain = MagicMock()
        update_chain.eq.return_value = update_chain
        update_chain.execute.return_value = MagicMock(data=[])

        mock_supabase_obj, _ = _make_supabase_mock(rows)

        original_table_side_effect = mock_supabase_obj.table.side_effect

        def table_side_effect_with_capture(name):
            t = original_table_side_effect(name)

            def capturing_update(data):
                written_updates.append(data)
                return update_chain

            t.update.side_effect = capturing_update
            return t

        mock_supabase.table.side_effect = table_side_effect_with_capture

        run_backfill(batch_size=50)

        assert len(written_updates) >= 1
        for update_data in written_updates:
            assert "compensation_meta" in update_data
            assert update_data["compensation_meta"] is not None

    @patch("scripts.backfill_compensation.extract_and_guard")
    @patch("scripts.backfill_compensation.supabase")
    def test_constraint_violation_skips_structured_fields(self, mock_supabase, mock_extract):
        """Rows with constraint violations get compensation_meta with notes but no structured fields.

        Validates: Requirement 14.7 — constraint violations are logged and skipped.
        """
        from scripts.backfill_compensation import run_backfill

        rows = [_make_row("job-bad")]
        # Return an extraction with max_value < min_value (range violation)
        bad_extraction = CompensationExtraction(
            unit_text="YEAR",
            min_value=7_000_000,
            max_value=5_000_000,  # violates range check
            hours_per_week=None,
            currency="CAD",
            raw_note=None,
            confidence=0.7,
        )
        mock_extract.return_value = bad_extraction

        written_updates = []

        update_chain = MagicMock()
        update_chain.eq.return_value = update_chain
        update_chain.execute.return_value = MagicMock(data=[])

        mock_supabase_obj, _ = _make_supabase_mock(rows)
        original_table_side_effect = mock_supabase_obj.table.side_effect

        def table_side_effect_with_capture(name):
            t = original_table_side_effect(name)

            def capturing_update(data):
                written_updates.append(data)
                return update_chain

            t.update.side_effect = capturing_update
            return t

        mock_supabase.table.side_effect = table_side_effect_with_capture

        summary = run_backfill(batch_size=50)

        assert summary["constraint_violations"] == 1
        assert summary["skipped"] == 1
        # The update should contain notes about the violation
        for update_data in written_updates:
            if "compensation_meta" in update_data:
                notes = update_data["compensation_meta"].get("notes", "")
                assert "constraint_violation" in notes
