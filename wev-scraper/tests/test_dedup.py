"""Tests that save_job rejects duplicate listing URLs.

All Supabase calls are mocked — no real DB is touched.
"""

from unittest.mock import MagicMock, patch
from utils.db import save_job, _find_existing_job, _extract_response_data

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FAKE_SOURCE_ID = "source-aaa"

def _make_job(url="https://example.com/jobs/123", org="Acme", title="Widget Maker"):
    return {
        "organization": org,
        "job_title": title,
        "location": "Toronto, ON",
        "date_posted": "2026-03-01",
        "close_date": None,
        "listing_url": url,
        "description": "A great job.",
        "employment_type": "Full-time",
        "wage": "$60,000",
    }


def _mock_response(data):
    """Build a mock Supabase response object."""
    resp = MagicMock()
    resp.data = data
    return resp


# ---------------------------------------------------------------------------
# _extract_response_data
# ---------------------------------------------------------------------------

class TestExtractResponseData:
    def test_none_response(self):
        assert _extract_response_data(None) is None

    def test_empty_list(self):
        resp = _mock_response([])
        assert _extract_response_data(resp) is None

    def test_single_row(self):
        row = {"id": "abc", "listing_url": "https://x.com"}
        resp = _mock_response([row])
        assert _extract_response_data(resp) == row

    def test_dict_response(self):
        row = {"id": "abc"}
        assert _extract_response_data({"data": [row]}) == row


# ---------------------------------------------------------------------------
# _find_existing_job — URL matching
# ---------------------------------------------------------------------------

class TestFindExistingJob:
    @patch("utils.db.supabase")
    def test_exact_url_match(self, mock_sb):
        existing = {"id": "row-1", "listing_url": "https://example.com/jobs/123", "summary": "ok"}
        mock_sb.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = _mock_response([existing])

        result = _find_existing_job(_make_job())
        assert result is not None
        assert result["id"] == "row-1"

    @patch("utils.db.supabase")
    def test_trailing_slash_variant_match(self, mock_sb):
        """A job stored as /jobs/123/ should match a lookup for /jobs/123."""
        existing = {"id": "row-2", "listing_url": "https://example.com/jobs/123/", "summary": None}

        def side_effect_eq(col, val):
            chain = MagicMock()
            if val == "https://example.com/jobs/123":
                chain.order.return_value.limit.return_value.execute.return_value = _mock_response([])
            elif val == "https://example.com/jobs/123/":
                chain.order.return_value.limit.return_value.execute.return_value = _mock_response([existing])
            else:
                chain.order.return_value.limit.return_value.execute.return_value = _mock_response([])
            return chain

        mock_sb.table.return_value.select.return_value.eq.side_effect = side_effect_eq

        result = _find_existing_job(_make_job(url="https://example.com/jobs/123"))
        assert result is not None
        assert result["id"] == "row-2"

    @patch("utils.db.supabase")
    def test_no_match_returns_none(self, mock_sb):
        empty = _mock_response([])
        mock_sb.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = empty

        result = _find_existing_job(_make_job(url="https://new-site.com/unique"))
        assert result is None


# ---------------------------------------------------------------------------
# save_job — deduplication by URL
# ---------------------------------------------------------------------------

class TestSaveJobDedup:
    @patch("utils.db.is_truthy_env")
    @patch("utils.db.supabase")
    @patch("utils.db._find_existing_job")
    def test_first_insert_succeeds(self, mock_find, mock_sb, mock_env):
        mock_env.return_value = False
        mock_find.return_value = None
        mock_sb.table.return_value.insert.return_value.execute.return_value = _mock_response([{"id": "new"}])

        result, _ = save_job(_make_job(), FAKE_SOURCE_ID)
        assert result == "added"
        mock_sb.table.return_value.insert.assert_called_once()

    @patch("utils.db.is_truthy_env")
    @patch("utils.db.supabase")
    @patch("utils.db._find_existing_job")
    def test_duplicate_url_is_skipped(self, mock_find, mock_sb, mock_env):
        """Saving a job whose URL already exists should return 'skipped'."""
        mock_env.return_value = False
        mock_find.return_value = {"id": "existing-1", "listing_url": "https://example.com/jobs/123", "summary": "old"}

        result, _ = save_job(_make_job(), FAKE_SOURCE_ID)
        assert result == "skipped"
        mock_sb.table.return_value.insert.assert_not_called()

    @patch("utils.db.is_truthy_env")
    @patch("utils.db.supabase")
    @patch("utils.db._find_existing_job")
    def test_duplicate_url_with_trailing_slash_is_skipped(self, mock_find, mock_sb, mock_env):
        """URL variants (trailing slash) should also be caught."""
        mock_env.return_value = False
        mock_find.return_value = {"id": "existing-2", "listing_url": "https://example.com/jobs/123/", "summary": None}

        result, _ = save_job(_make_job(url="https://example.com/jobs/123"), FAKE_SOURCE_ID)
        assert result == "skipped"
        mock_sb.table.return_value.insert.assert_not_called()

    @patch("utils.db.is_truthy_env")
    @patch("utils.db.supabase")
    @patch("utils.db._find_existing_job")
    def test_different_url_is_added(self, mock_find, mock_sb, mock_env):
        mock_env.return_value = False
        mock_find.return_value = None
        mock_sb.table.return_value.insert.return_value.execute.return_value = _mock_response([{"id": "new-2"}])

        result, _ = save_job(_make_job(url="https://example.com/jobs/999"), FAKE_SOURCE_ID)
        assert result == "added"

    @patch("utils.db.is_truthy_env")
    @patch("utils.db.supabase")
    @patch("utils.db._find_existing_job")
    def test_same_url_different_org_still_skipped(self, mock_find, mock_sb, mock_env):
        """URL is the primary dedup key — even if org differs, same URL = skip."""
        mock_env.return_value = False
        mock_find.return_value = {"id": "existing-3", "listing_url": "https://example.com/jobs/123", "summary": None}

        job = _make_job(url="https://example.com/jobs/123", org="Different Org")
        result, _ = save_job(job, FAKE_SOURCE_ID)
        assert result == "skipped"

    @patch("utils.db.is_truthy_env")
    @patch("utils.db.supabase")
    @patch("utils.db._find_existing_job")
    def test_missing_url_is_skipped_not_inserted(self, mock_find, mock_sb, mock_env):
        """Jobs with no listing_url should be rejected before any DB call."""
        mock_env.return_value = False
        job = _make_job()
        job["listing_url"] = ""

        result, _ = save_job(job, FAKE_SOURCE_ID)
        assert result == "skipped"
        mock_find.assert_not_called()

    @patch("utils.db.is_truthy_env")
    @patch("utils.db.supabase")
    @patch("utils.db._find_existing_job")
    def test_insert_conflict_recovers_via_find(self, mock_find, mock_sb, mock_env):
        """If insert hits a unique constraint, recovery lookup should update the existing row."""
        mock_env.return_value = False
        mock_find.side_effect = [
            None,  # first call: no existing job found
            {"id": "existing-4", "listing_url": "https://example.com/jobs/123"},  # recovery call
        ]
        mock_sb.table.return_value.insert.return_value.execute.side_effect = Exception(
            "duplicate key value violates unique constraint"
        )
        mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value = _mock_response([{}])

        result, _ = save_job(_make_job(), FAKE_SOURCE_ID)
        assert result == "updated"


# ---------------------------------------------------------------------------
# Simulate full scrape-then-re-scrape flow
# ---------------------------------------------------------------------------

class TestEndToEndDedup:
    @patch("utils.db.is_truthy_env")
    @patch("utils.db.supabase")
    @patch("utils.db._find_existing_job")
    def test_two_runs_same_jobs_no_duplicates(self, mock_find, mock_sb, mock_env):
        """Simulates running the scraper twice with the same jobs.

        First run: both jobs are new → 'added'.
        Second run: both jobs already exist → 'skipped'.
        """
        mock_env.return_value = False
        jobs = [
            _make_job(url="https://example.com/jobs/1", org="A", title="Job 1"),
            _make_job(url="https://example.com/jobs/2", org="B", title="Job 2"),
        ]

        # Run 1: nothing exists
        mock_find.return_value = None
        mock_sb.table.return_value.insert.return_value.execute.return_value = _mock_response([{"id": "new"}])
        results_run1 = [save_job(j, FAKE_SOURCE_ID)[0] for j in jobs]
        assert results_run1 == ["added", "added"]

        # Run 2: both already exist
        mock_find.side_effect = [
            {"id": "id-1", "listing_url": "https://example.com/jobs/1", "summary": None},
            {"id": "id-2", "listing_url": "https://example.com/jobs/2", "summary": None},
        ]
        results_run2 = [save_job(j, FAKE_SOURCE_ID)[0] for j in jobs]
        assert results_run2 == ["skipped", "skipped"]

        # insert was only called during run 1
        assert mock_sb.table.return_value.insert.call_count == 2
