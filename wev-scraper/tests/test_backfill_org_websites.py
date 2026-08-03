"""Tests for backfill_org_websites minimal-fallback mode."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from llm.tavily_grounding import TavilyUnavailableError
from scripts.backfill_org_websites import (
    _FETCHERS,
    _should_skip_completed,
    fetch_orgs_minimal,
    run,
)


def test_fetchers_include_minimal_mode():
    assert set(_FETCHERS) == {"website", "minimal", "full"}


def test_fetch_orgs_minimal_filters_null_sse_rating():
    mock_resp = MagicMock()
    mock_resp.data = [
        {"id": 1, "name": "Minimal Org", "sse_rating": None},
    ]
    table = MagicMock()
    table.select.return_value = table
    table.is_.return_value = table
    table.gt.return_value = table
    table.order.return_value = table
    table.limit.return_value = table
    table.execute.return_value = mock_resp

    with patch("scripts.backfill_org_websites.supabase") as mock_sb:
        mock_sb.table.return_value = table
        rows = fetch_orgs_minimal(limit=10, after_id=0)

    mock_sb.table.assert_called_once_with("organizations")
    table.is_.assert_called_once_with("sse_rating", "null")
    assert rows == mock_resp.data


def test_run_aborts_when_tavily_unavailable():
    """Backfill must refuse before processing any org when Tavily is broken."""
    with patch(
        "llm.tavily_grounding.require_tavily",
        side_effect=TavilyUnavailableError("Tavily package missing"),
    ), patch(
        "scripts.backfill_org_websites.OrganizationAssessor",
    ) as mock_assessor, patch(
        "scripts.backfill_org_websites.fetch_orgs_minimal",
    ) as mock_fetch:
        with pytest.raises(TavilyUnavailableError, match="Tavily package missing"):
            run(
                mode="minimal",
                limit=5,
                dry_run=True,
                delay_seconds=0,
                after_id=0,
            )

    mock_assessor.assert_not_called()
    mock_fetch.assert_not_called()


def test_run_aborts_when_tavily_import_fails():
    """Missing tavily package → require_tavily raises → no org processed."""
    with patch(
        "llm.tavily_grounding._tavily_import_error",
        return_value="No module named 'tavily'",
    ), patch(
        "llm.tavily_grounding.tavily_api_key",
        return_value="fake-key",
    ), patch(
        "scripts.backfill_org_websites.OrganizationAssessor",
    ) as mock_assessor, patch(
        "scripts.backfill_org_websites.fetch_orgs_minimal",
    ) as mock_fetch:
        with pytest.raises(TavilyUnavailableError, match="not importable"):
            run(
                mode="full",
                limit=1,
                dry_run=True,
                delay_seconds=0,
            )

    mock_assessor.assert_not_called()
    mock_fetch.assert_not_called()


def test_run_minimal_mode_reassesses_and_updates():
    org = {
        "id": 42,
        "name": "Fallback Co",
        "sse_rating": None,
        "municipality": "Toronto",
        "province": "ON",
        "description": None,
        "website": None,
        "sse_details": None,
        "values_list": None,
        "mission_statement": None,
        "type": None,
        "language": None,
    }
    updates = {
        "sse_rating": "yes",
        "type": "nonprofit",
        "description": "A real org.",
        "sse_details": {"classified_at": "2026-07-29T00:00:00+00:00"},
    }

    assessor = MagicMock()
    assessor.assess_and_build_update.return_value = updates
    repo = MagicMock()

    with patch("llm.tavily_grounding.require_tavily"), \
         patch("scripts.backfill_org_websites.OrganizationAssessor", return_value=assessor), \
         patch("scripts.backfill_org_websites.OrganizationRepository", return_value=repo), \
         patch(
             "scripts.backfill_org_websites.fetch_orgs_minimal",
             side_effect=[[org], []],
         ) as mock_fetch, \
         patch(
             "scripts.backfill_org_websites.fetch_recent_job_for_org",
             return_value=None,
         ):
        summary = run(
            mode="minimal",
            limit=5,
            dry_run=False,
            delay_seconds=0,
            after_id=0,
        )

    mock_fetch.assert_called()
    assessor.assess_and_build_update.assert_called_once_with(
        org,
        force_lang=False,
        job_title="",
        listing_url=None,
        municipality=None,
        province=None,
    )
    repo.update_org.assert_called_once_with(42, **updates)
    assert summary["mode"] == "minimal"
    assert summary["updated"] == 1
    assert summary["errors"] == 0
    assert summary["skipped_completed"] == 0


def _org_with_classified_at(hours_ago: float) -> dict:
    when = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
    return {
        "id": 7,
        "name": "Done Org",
        "sse_details": {"classified_at": when.isoformat()},
    }


def test_should_skip_completed_by_default():
    assert _should_skip_completed(_org_with_classified_at(1), overwrite_recent_hours=None)
    assert not _should_skip_completed(
        {"id": 1, "sse_details": None}, overwrite_recent_hours=None,
    )


def test_overwrite_recent_hours_allows_only_within_window():
    assert not _should_skip_completed(
        _org_with_classified_at(0.5), overwrite_recent_hours=1,
    )
    assert _should_skip_completed(
        _org_with_classified_at(2), overwrite_recent_hours=1,
    )
