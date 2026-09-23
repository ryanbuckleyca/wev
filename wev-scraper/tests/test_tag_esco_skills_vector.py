"""Unit tests for tag_esco_skills_vector helpers.

Tests:
- test_select_skills_*: combined scoring
- test_dry_run_no_writes: zero DB calls with dry_run=True
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from scripts.tag_esco_skills_vector import (
    replace_job_skills,
    select_skills,
)


# ---------------------------------------------------------------------------
# select_skills
# ---------------------------------------------------------------------------

def _make_candidates(scores: list[float], labels: list[str] | None = None) -> list[dict]:
    if labels is None:
        labels = [f"Skill {i}" for i in range(len(scores))]
    return [
        {"concept_uri": f"uri-{i}", "score": s, "preferred_label_en": labels[i]}
        for i, s in enumerate(scores)
    ]


def test_select_skills_floor_excludes_all_below():
    """All candidates below combined floor are excluded."""
    candidates = _make_candidates([0.10, 0.12, 0.15], labels=["alpha", "beta", "gamma"])
    result, _ = select_skills(candidates, combined_floor=0.50)
    assert result == []


def test_select_skills_floor_keeps_above():
    """Candidates above combined floor are kept."""
    candidates = _make_candidates([0.10, 0.60, 0.70], labels=["alpha", "beta", "gamma"])
    result, _ = select_skills(candidates, combined_floor=0.50)
    scores = [c["score"] for c in result]
    assert len(result) == 2
    assert all(s > 0.50 for s in scores)


def test_select_skills_cap():
    """Result length never exceeds the 50 sanity ceiling."""
    candidates = _make_candidates(
        [0.60 + i * 0.001 for i in range(60)],
        labels=[f"skill-{i}" for i in range(60)],
    )
    result, _ = select_skills(candidates, combined_floor=0.50)
    assert len(result) == 50


def test_select_skills_sorted_descending():
    candidates = _make_candidates(
        [0.55, 0.75, 0.65],
        labels=["alpha", "beta", "gamma"],
    )
    result, _ = select_skills(candidates, combined_floor=0.50)
    scores = [c["score"] for c in result]
    assert scores == sorted(scores, reverse=True)


def test_replace_job_skills_upserts_before_orphan_delete():
    """Upsert must run before delete so a failed write cannot empty the junction."""
    calls: list[str] = []
    table = MagicMock()

    upsert_chain = MagicMock()
    upsert_chain.execute = MagicMock(side_effect=lambda: calls.append("upsert") or MagicMock())
    table.upsert = MagicMock(return_value=upsert_chain)

    delete_chain = MagicMock()
    delete_chain.eq = MagicMock(return_value=delete_chain)
    delete_chain.not_ = MagicMock()
    delete_chain.not_.in_ = MagicMock(return_value=delete_chain)
    delete_chain.execute = MagicMock(side_effect=lambda: calls.append("delete") or MagicMock())
    table.delete = MagicMock(return_value=delete_chain)

    with patch("scripts.tag_esco_skills_vector.supabase") as mock_sb:
        mock_sb.table.return_value = table
        replace_job_skills(
            "job-1",
            [{"job_id": "job-1", "skill_id": "uri-a", "score": 0.9, "source": "jina-v3"}],
        )

    assert calls == ["upsert", "delete"]
    table.upsert.assert_called_once()
    delete_chain.not_.in_.assert_called_once_with("skill_id", ["uri-a"])


def test_replace_job_skills_empty_clears_all():
    table = MagicMock()
    delete_chain = MagicMock()
    delete_chain.eq = MagicMock(return_value=delete_chain)
    delete_chain.execute = MagicMock(return_value=MagicMock(data=[]))
    table.delete = MagicMock(return_value=delete_chain)

    with patch("scripts.tag_esco_skills_vector.supabase") as mock_sb:
        mock_sb.table.return_value = table
        replace_job_skills("job-1", [])

    table.delete.assert_called_once()
    table.upsert.assert_not_called()
    delete_chain.eq.assert_called_once_with("job_id", "job-1")


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
    mock_supabase.rpc.return_value.execute.return_value.data = [
        {**c, "query_index": i} for i, c in enumerate(candidates[:2])
    ]
    mock_supabase.table.return_value.select.return_value.in_.return_value.execute.return_value.data = [
        {
            "id": "job-dry-run",
            "job_title": "Coordinator",
            "organization": "Org",
            "summary": None,
            "description": "Coordinate things",
            "skills_raw": ["budget management", "vendor coordination"],
        }
    ]

    with (
        patch("scripts.tag_esco_skills_vector.supabase", mock_supabase),
        patch("scripts.tag_esco_skills_vector.JinaEmbeddingService") as mock_svc_cls,
    ):
        fake_svc = _make_fake_svc()
        fake_svc.embed.return_value = [[0.1] * 1024, [0.2] * 1024]
        mock_svc_cls.return_value = fake_svc
        from scripts.tag_esco_skills_vector import tag_esco_skills_vector

        result = tag_esco_skills_vector(job_ids=["job-dry-run"], dry_run=True)

    # dry-run may still SELECT/RPC, but must not write
    for call in mock_supabase.table.return_value.method_calls:
        assert call[0] not in ("upsert", "update", "insert", "delete")
    assert result["errors"] == 0
    assert result["processed"] == 1


def test_retag_clears_jobs_without_skills_raw_phrases():
    """--retag must wipe stale job_skills / jobs.skills when phrases are missing."""
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.in_.return_value.execute.return_value.data = [
        {
            "id": "job-no-phrases",
            "job_title": "Teaser",
            "organization": "Org",
            "summary": None,
            "description": "See website",
            "skills_raw": [],
        }
    ]
    delete_chain = MagicMock()
    delete_chain.eq.return_value.execute.return_value = MagicMock(data=[])
    mock_supabase.table.return_value.delete.return_value = delete_chain
    update_chain = MagicMock()
    update_chain.eq.return_value.execute.return_value = MagicMock(data=[])
    mock_supabase.table.return_value.update.return_value = update_chain

    with (
        patch("scripts.tag_esco_skills_vector.supabase", mock_supabase),
        patch("scripts.tag_esco_skills_vector.JinaEmbeddingService") as mock_svc_cls,
    ):
        mock_svc_cls.return_value = _make_fake_svc()
        from scripts.tag_esco_skills_vector import tag_esco_skills_vector

        result = tag_esco_skills_vector(job_ids=["job-no-phrases"], retag=True, dry_run=False)

    mock_supabase.table.return_value.delete.assert_called()
    mock_supabase.table.return_value.update.assert_called()
    update_chain.eq.assert_called_with("id", "job-no-phrases")
    # skills cleared to empty list
    assert mock_supabase.table.return_value.update.call_args[0][0] == {"skills": []}
    assert result["processed"] == 1
    assert result["inserted"] == 0
    mock_supabase.rpc.assert_not_called()
