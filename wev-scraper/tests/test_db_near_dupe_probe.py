"""Focused tests for utils.db._find_confident_near_duplicate paging/filters."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import utils.db as db


def _probe_job(**overrides):
    job = {
        "job_title": "Coordinator",
        "organization": "Example Org",
        "organization_id": "org-1",
        "listing_url": "https://boards.example.com/jobs/new",
        "description": ("Shared posting body for near-dupe confidence. " * 20),
        "date_posted": "2026-11-01",
    }
    job.update(overrides)
    return job


def test_near_dupe_probe_includes_null_date_and_pages_with_cursor_cap():
    """NULL date_posted stays in the filter; full pages advance cursor; cap stops."""
    page_size = 2
    max_pages = 3
    calls: list[dict] = []

    def _page(ids: list[str], *, null_date: bool = False):
        rows = []
        for i, job_id in enumerate(ids):
            rows.append(
                {
                    "id": job_id,
                    "job_title": "Coordinator",
                    "listing_url": f"https://boards.example.com/jobs/{job_id}",
                    "date_posted": None if null_date and i == 0 else "2026-11-02",
                    "description": ("Shared posting body for near-dupe confidence. " * 20),
                    "employment_type": None,
                    "municipality": None,
                    "province": None,
                    "location": None,
                    "organization": "Example Org",
                    "organization_id": "org-1",
                    "source_id": "src-other",
                }
            )
        return rows

    # Three full pages → hit the page cap without a match.
    pages = [
        _page(["c", "b"], null_date=True),
        _page(["a", "9"]),
        _page(["8", "7"]),
    ]
    page_idx = {"n": 0}

    class _Query:
        def __init__(self):
            self.filters: dict = {}

        def select(self, *_a, **_k):
            return self

        def eq(self, col, val):
            self.filters[col] = val
            return self

        def order(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def or_(self, expr):
            self.filters["or"] = expr
            return self

        def lt(self, col, val):
            self.filters[f"lt_{col}"] = val
            return self

        def execute(self):
            calls.append(dict(self.filters))
            n = page_idx["n"]
            page_idx["n"] = n + 1
            data = pages[n] if n < len(pages) else []
            return MagicMock(data=data)

    mock_supabase = MagicMock()
    mock_supabase.table.side_effect = lambda *_a, **_k: _Query()

    with (
        patch.object(db, "supabase", mock_supabase),
        patch.object(db, "_NEAR_DUPE_CANDIDATE_PAGE", page_size),
        patch.object(db, "_NEAR_DUPE_CANDIDATE_MAX_PAGES", max_pages),
        patch(
            "utils.job_near_dupes.is_confident_duplicate_pair",
            return_value=False,
        ),
    ):
        found = db._find_confident_near_duplicate(
            _probe_job(), organization_id="org-1", source_id="src-1"
        )

    assert found is None
    assert len(calls) == max_pages
    assert "date_posted.is.null" in calls[0]["or"]
    assert "date_posted.gte." in calls[0]["or"]
    assert "date_posted.lt." in calls[0]["or"]
    # Full first page advances cursor to the last id on that page ("b").
    assert calls[1]["lt_id"] == "b"
    assert calls[2]["lt_id"] == "9"
