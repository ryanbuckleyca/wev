"""Unit tests for tag_esco_skills_vector helpers.

Tests:
- test_build_job_embedding_text_*: correct format, missing fields omitted
- test_select_skills_*: combined scoring (embedding × lexical relevance)
- test_label_relevance_*: lexical overlap scoring
- test_tokenize_*: tokenization edge cases
- test_build_job_word_set: bag-of-words from job dict
- test_dry_run_no_writes: zero DB calls with dry_run=True
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from llm.jina_embedding import MAX_API_EMBEDDING_INPUT_CHARS
from scripts.tag_esco_skills_vector import (
    build_job_embedding_text,
    build_job_word_set,
    label_relevance,
    select_skills,
    tokenize,
)

# ---------------------------------------------------------------------------
# tokenize
# ---------------------------------------------------------------------------

def test_tokenize_basic():
    assert tokenize("Hello World") == ["hello", "world"]


def test_tokenize_drops_short_tokens():
    assert tokenize("I am a dev") == ["am", "dev"]


def test_tokenize_keeps_hyphens_and_apostrophes():
    result = tokenize("self-managed don't")
    assert "self-managed" in result
    assert "don't" in result


# ---------------------------------------------------------------------------
# build_job_word_set
# ---------------------------------------------------------------------------

def test_build_job_word_set_combines_fields():
    job = {
        "job_title": "Bookkeeper",
        "organization": "Acme Corp",
        "summary": "Manage accounts",
        "description": "Handle financial records",
    }
    words = build_job_word_set(job)
    assert "bookkeeper" in words
    assert "acme" in words
    assert "accounts" in words
    assert "financial" in words
    assert "records" in words


def test_build_job_word_set_handles_none_fields():
    job = {"job_title": "Coordinator", "organization": None, "summary": None, "description": None}
    words = build_job_word_set(job)
    assert "coordinator" in words


# ---------------------------------------------------------------------------
# label_relevance
# ---------------------------------------------------------------------------

def test_label_relevance_full_match():
    job_words = {"grape", "harvest"}
    assert label_relevance("manage grape harvest", job_words) == 1.0


def test_label_relevance_no_match():
    job_words = {"budget", "accounting", "finance"}
    assert label_relevance("manage grape harvest", job_words) == 0.0


def test_label_relevance_partial_match():
    job_words = {"grape", "budget", "finance"}
    # "grape" hits, "harvest" misses → 0.5
    assert label_relevance("manage grape harvest", job_words) == 0.5


def test_label_relevance_all_stopwords_and_generic():
    """Labels made entirely of stop words + generic management terms return 1.0 (neutral)."""
    job_words = {"anything"}
    assert label_relevance("manage the operations", job_words) == 1.0


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
    assert "A" * 2000 in text  # full description included (under char cap)


def test_build_job_embedding_text_respects_token_safe_char_cap():
    job = {
        "job_title": "T",
        "organization": "O",
        "summary": "S",
        "description": "D" * (MAX_API_EMBEDDING_INPUT_CHARS * 2),
    }
    text = build_job_embedding_text(job)
    assert len(text) == MAX_API_EMBEDDING_INPUT_CHARS


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

def _make_candidates(scores: list[float], labels: list[str] | None = None) -> list[dict]:
    if labels is None:
        labels = [f"Skill {i}" for i in range(len(scores))]
    return [
        {"concept_uri": f"uri-{i}", "score": s, "preferred_label_en": labels[i]}
        for i, s in enumerate(scores)
    ]


def test_select_skills_requires_job_words():
    """select_skills now requires a job_words argument."""
    candidates = _make_candidates([0.40], labels=["accounting"])
    job_words = {"accounting"}
    result, _ = select_skills(candidates, job_words)
    assert len(result) == 1


def test_select_skills_floor_excludes_all_below():
    """All candidates below combined floor are excluded."""
    # With job_words containing all label words, combined = embedding * 1.0
    candidates = _make_candidates([0.10, 0.12, 0.15], labels=["alpha", "beta", "gamma"])
    job_words = {"alpha", "beta", "gamma"}
    result, _ = select_skills(candidates, job_words, combined_floor=0.18)
    assert result == []


def test_select_skills_floor_keeps_above():
    """Candidates above combined floor are kept."""
    candidates = _make_candidates([0.10, 0.30, 0.40], labels=["alpha", "beta", "gamma"])
    job_words = {"alpha", "beta", "gamma"}
    result, _ = select_skills(candidates, job_words, combined_floor=0.18)
    combined_scores = [c["score"] for c in result]
    # 0.10 * 1.0 = 0.10 → excluded
    # 0.30 * 1.0 = 0.30 → kept
    # 0.40 * 1.0 = 0.40 → kept
    assert len(result) == 2
    assert all(s > 0.18 for s in combined_scores)


def test_select_skills_cap():
    """Result length never exceeds max_count."""
    candidates = _make_candidates(
        [0.30 + i * 0.001 for i in range(20)],
        labels=[f"skill-{i}" for i in range(20)],
    )
    # Make all labels match so combined = embedding * 1.0
    job_words = {f"skill-{i}" for i in range(20)}
    result, _ = select_skills(candidates, job_words, max_count=10, combined_floor=0.18)
    assert len(result) <= 10


def test_select_skills_irrelevant_label_excluded():
    """A candidate with high embedding score but irrelevant label is excluded.

    This is the core fix: "manage grape harvest" against a job about operations
    management (no "grape" or "harvest") should be zeroed out by relevance.
    """
    candidates = _make_candidates(
        [0.40],
        labels=["manage grape harvest"],
    )
    job_words = {"operations", "budget", "scheduling", "coordinator"}
    result, _ = select_skills(candidates, job_words, combined_floor=0.18)
    # "grape" and "harvest" not in job_words → relevance = 0.0 → combined = 0.0
    assert result == []


def test_select_skills_relevant_label_survives():
    """A candidate with a relevant label survives with a reasonable combined score."""
    candidates = _make_candidates(
        [0.40],
        labels=["monitor financial accounts"],
    )
    job_words = {"financial", "accounts", "bookkeeping", "ledger"}
    result, _ = select_skills(candidates, job_words, combined_floor=0.18)
    assert len(result) == 1
    # combined = 0.40 * 1.0 (both "financial" and "accounts" hit)
    assert result[0]["score"] == 0.40 * 1.0


def test_select_skills_adds_embedding_score_and_relevance():
    """Selected candidates have embedding_score and relevance fields."""
    candidates = _make_candidates([0.40], labels=["financial accounting"])
    job_words = {"financial", "accounting"}
    result, _ = select_skills(candidates, job_words)
    assert "embedding_score" in result[0]
    assert "relevance" in result[0]
    assert result[0]["embedding_score"] == 0.40
    assert result[0]["relevance"] == 1.0


def test_select_skills_sorted_descending():
    candidates = _make_candidates(
        [0.35, 0.55, 0.45],
        labels=["alpha", "beta", "gamma"],
    )
    job_words = {"alpha", "beta", "gamma"}
    result, _ = select_skills(candidates, job_words, combined_floor=0.18)
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
