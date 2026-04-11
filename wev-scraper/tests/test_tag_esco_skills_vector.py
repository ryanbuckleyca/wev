"""Unit tests for tag_esco_skills_vector helpers.

Tests:
- test_build_job_embedding_text_*: correct format, missing fields omitted
- test_select_skills_floor: candidates below floor are excluded
- test_select_skills_cap: result length never exceeds max_count
- test_select_skills_elbow: all above-floor candidates returned (up to cap)
- test_dry_run_no_writes: zero DB calls with dry_run=True
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from scripts.tag_esco_skills_vector import (
    build_job_embedding_text,
    select_skills,
)


# ---------------------------------------------------------------------------
# build_job_embedding_text
# ---------------------------------------------------------------------------

def test_build_job_embedding_text_all_fields():
    job = {
        "job_title": "Software Engineer",
        "organization": "Acme Corp",
        "summary": "Build great things",
        "description": "A" * 2000,
    }
    text = build_job_embedding_text(job)
    assert "Software Engineer" in text
    assert "Acme Corp" in text
    assert "Build great things" in text
    assert "A" * 2000 in text  # full description included (no 1000-char truncation)


def test_build_job_embedding_text_missing_fields():
    job = {"job_title": "Coordinator"}
    text = build_job_embedding_text(job)
    assert text == "Coordinator"
    assert " | " not in text


def test_build_job_embedding_text_no_trailing_separator():
    job = {"job_title": "Manager", "organization": "Org"}
    text = build_job_embedding_text(job)
    assert not text.endswith(" | ")
    assert text == "Manager | Org"


# ---------------------------------------------------------------------------
# select_skills
# ---------------------------------------------------------------------------

def _make_candidates(scores: list[float]) -> list[dict]:
    return [{"concept_uri": f"uri-{i}", "score": s} for i, s in enumerate(scores)]


def test_select_skills_floor_excludes_all_below():
    candidates = _make_candidates([0.20, 0.22, 0.24])
    result, _ = select_skills(candidates, floor=0.25)
    assert result == []


def test_select_skills_floor_keeps_above():
    candidates = _make_candidates([0.20, 0.30, 0.40])
    result, _ = select_skills(candidates, floor=0.25)
    scores = [c["score"] for c in result]
    assert 0.20 not in scores
    assert 0.30 in scores
    assert 0.40 in scores


def test_select_skills_cap():
    # 20 candidates all above floor, no obvious cliff → cap at max_count
    candidates = _make_candidates([0.30 + i * 0.001 for i in range(20)])
    result, _ = select_skills(candidates, max_count=10, floor=0.25)
    assert len(result) <= 10


def test_select_skills_elbow():
    # With floor+cap, all scores above floor are kept (up to max_count)
    # The elbow is handled by find_elbow_cutoff separately if needed in future
    scores = [0.71, 0.68, 0.65, 0.61, 0.41, 0.38, 0.35]
    candidates = _make_candidates(scores)
    result, cutoff = select_skills(candidates, max_count=10, floor=0.25)
    result_scores = [c["score"] for c in result]
    # All above floor should be present (7 candidates, all > 0.25)
    assert len(result) == 7
    assert cutoff == 0.25
    assert all(s > 0.25 for s in result_scores)


def test_select_skills_sorted_descending():
    candidates = _make_candidates([0.35, 0.55, 0.45])
    result, _ = select_skills(candidates, floor=0.25)
    scores = [c["score"] for c in result]
    assert scores == sorted(scores, reverse=True)


# ---------------------------------------------------------------------------
# dry_run produces no DB writes
# ---------------------------------------------------------------------------

def _make_fake_svc(embedding=None):
    svc = MagicMock()
    svc.is_local = False
    svc.embed.return_value = [embedding or [0.1] * 1024]
    return svc


def _make_rpc_candidates(n=5, base_score=0.6):
    return [
        {
            "concept_uri": f"http://data.europa.eu/esco/skill/{i}",
            "preferred_label_en": f"Skill {i}",
            "preferred_label_fr": f"Compétence {i}",
            "similarity": base_score + i * 0.01,
        }
        for i in range(n)
    ]


def test_dry_run_no_writes():
    """No DB write calls when dry_run=True."""
    candidates = _make_rpc_candidates(3)

    mock_supabase = MagicMock()
    mock_supabase.rpc.return_value.execute.return_value.data = candidates

    job = {
        "id": "job-dry-run",
        "job_title": "Coordinator",
        "organization": "Org",
        "summary": None,
        "description": "Coordinate things",
    }

    with patch("scripts.tag_esco_skills_vector.supabase", mock_supabase):
        from scripts.tag_esco_skills_vector import _tag_single_job
        result = _tag_single_job(job, _make_fake_svc(), dry_run=True)

    mock_supabase.table.assert_not_called()
    assert result["error"] is None
