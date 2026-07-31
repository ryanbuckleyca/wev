"""Tests for shared Tavily evidence helpers."""

from llm.local_grounded import _truncate_keep_ends
from llm.tavily_grounding import (
    entity_require_terms,
    inject_grounding_evidence,
    trim_evidence,
)


def test_inject_grounding_evidence_marks_search_as_secondary():
    out = inject_grounding_evidence("PROMPT BODY", "snippet about org")
    assert out.startswith("SUPPORTING WEB EVIDENCE")
    assert "Interpretive fields" in out
    assert "SOURCE DESCRIPTION" in out
    assert "snippet about org" in out
    assert out.endswith("PROMPT BODY")


def test_inject_grounding_evidence_skips_blank():
    assert inject_grounding_evidence("PROMPT", "  ") == "PROMPT"
    assert inject_grounding_evidence("PROMPT", "") == "PROMPT"


def test_trim_evidence_respects_budget():
    long = "word " * 500
    trimmed = trim_evidence(long, max_chars=40)
    assert len(trimmed) <= 41  # ellipsis
    assert trimmed.endswith("…")


def test_entity_require_terms_skips_stopwords():
    terms = entity_require_terms("Goparity Canada Inc")
    assert "goparity" in terms
    assert "canada" not in terms
    assert "inc" not in terms


def test_truncate_keep_ends_preserves_tail_json():
    head = "RULES " * 200
    tail = '{"is_sse": true, "sse_rating": "strong_yes"}'
    full = head + "MIDDLE NOISE " * 400 + tail
    out = _truncate_keep_ends(full, max_chars=800, head_ratio=0.2)
    assert len(out) <= 800
    assert "RULES" in out
    assert '"sse_rating"' in out
    assert "truncated" in out.lower()


def test_org_assessment_prompt_keeps_description_out_of_interpretive_fields():
    from utils.organization_assessment import _build_assessment_prompt

    prompt = _build_assessment_prompt(
        "Park People",
        "Toronto",
        "ON",
        job_title="Coordinator",
        description="listing should be identity only",
        existing_description="Stored org blurb about parks.",
        listing_notes="listing should be identity only",
    )
    assert "SOURCE DESCRIPTION vs INTERPRETIVE FIELDS" in prompt
    assert "NEVER use SOURCE DESCRIPTION" in prompt
    assert "Stored org blurb about parks." in prompt
    assert "listing should be identity only" in prompt
    assert "not for interpretive fields" in prompt


def test_org_prompt_keeps_entity_after_local_truncate():
    from utils.organization_assessment import _build_assessment_prompt

    prompt = _build_assessment_prompt(
        "Park People",
        "Toronto",
        "ON",
        "Coordinator",
        "park notes",
        known_website="https://parkpeople.ca",
    )
    assert "ORGANIZATION DATA" in prompt
    # Entity block must sit near the end so head+tail truncation keeps it.
    assert prompt.rfind("ORGANIZATION DATA") > prompt.find("ALLOWED VALUES")
    truncated = _truncate_keep_ends(prompt, max_chars=8000)
    assert "Park People" in truncated
    assert "canonical_name" in truncated
    assert "parkpeople.ca" in truncated.lower()
