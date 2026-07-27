"""Tests for organization assessment response parsing."""

import json

from utils.organization_assessment import (
    _build_search_query,
    _parse_response,
    _parse_website,
)


def _assessment_json(**overrides) -> str:
    payload = {
        "canonical_name": "Nature Visuals",
        "slug": "nature-visuals",
        "website": "https://example.org",
        "description": "A short description.",
        "mission_statement": "Promote conservation through storytelling.",
        "type": "nonprofit",
        "values_raw": None,
        "values": ["Help Society"],
        "sse_rating": "strong_yes",
        "sse_confidence": 0.9,
        "sse_reasoning": "Aligned with SSE.",
        "must_haves_met": ["Clear purpose beyond profit"],
        "nice_to_haves_met": [],
        "flags": [],
    }
    payload.update(overrides)
    return json.dumps(payload)


def test_parse_response_does_not_truncate_over_limit_text(caplog):
    """Soft limits are prompt guidance only — never hard-cut stored fields."""
    import logging

    from utils.organization_assessment import (
        _ORG_DESCRIPTION_MAX_CHARS,
        _ORG_MISSION_MAX_CHARS,
        _ORG_VALUES_RAW_MAX_CHARS,
        _SSE_REASONING_MAX_CHARS,
    )

    reasoning = ("word " * 200).strip()
    description = "y" * 1200
    mission = ("Mission sentence. " * 80).strip()
    values_raw = ("Values text. " * 100).strip()
    assert len(reasoning) > _SSE_REASONING_MAX_CHARS
    assert len(description) > _ORG_DESCRIPTION_MAX_CHARS
    assert len(mission) > _ORG_MISSION_MAX_CHARS
    assert len(values_raw) > _ORG_VALUES_RAW_MAX_CHARS

    with caplog.at_level(logging.WARNING, logger="utils.organization_assessment"):
        result = _parse_response(
            _assessment_json(
                sse_reasoning=reasoning,
                description=description,
                mission_statement=mission,
                values_raw=values_raw,
            ),
            "Nature Visuals",
        )

    assert result is not None
    assert result["sse_reasoning"] == reasoning
    assert result["description"] == description
    assert result["mission_statement"] == mission
    assert result["values_raw"] == values_raw

    warnings = [r.message for r in caplog.records if "exceeds soft limit" in r.message]
    assert len(warnings) == 4
    assert any("description" in w and "kept untruncated" in w for w in warnings)
    assert any("sse_reasoning" in w for w in warnings)


def test_org_assessment_prompt_asks_to_paraphrase_within_limits():
    from utils.organization_assessment import _build_assessment_prompt

    prompt = _build_assessment_prompt(
        "Hamilton Bike Share Inc.",
        "Hamilton",
        "ON",
        job_title="Coordinator",
        description="listing notes",
    )
    assert "paraphrase to fit completely" in prompt
    assert "do not truncate" in prompt
    assert "paraphrase and condense" in prompt
    assert "Do NOT restate must_haves_met" in prompt
    assert "2–4 concise sentences" in prompt


def test_parse_website_keeps_employer_owned_host():
    assert _parse_website("https://www.mindrift.ai/about") == "https://www.mindrift.ai/about"
    assert _parse_website("mindrift.ai") == "https://mindrift.ai"


def test_parse_website_rejects_shared_hosts():
    assert _parse_website("https://boards.greenhouse.io/acme") is None
    assert _parse_website("https://facebook.com/acme-org") is None
    assert _parse_website("https://www.linkedin.com/company/acme") is None


def test_parse_response_nulls_shared_website():
    result = _parse_response(
        _assessment_json(website="https://boards.greenhouse.io/nature-visuals"),
        "Nature Visuals",
    )
    assert result is not None
    assert result["website"] is None


def test_build_search_query_targets_official_website():
    assert _build_search_query("Mindrift", "Toronto", "ON") == (
        '"Mindrift" official website Toronto ON'
    )


def test_build_search_query_includes_known_website():
    assert _build_search_query(
        "Gates Foundation",
        known_website="https://www.gatesfoundation.org/",
    ) == (
        '"Gates Foundation" official website https://www.gatesfoundation.org/'
    )


def test_org_assessment_prompt_uses_org_not_job_sse_criteria():
    from utils.organization_assessment import _build_assessment_prompt
    from utils.sse_prompts import ORG_EVALUATION_CRITERIA

    prompt = _build_assessment_prompt(
        "Hamilton Bike Share Inc.",
        "Hamilton",
        "ON",
        job_title="Coordinator",
        description="truncated job posting...",
    )
    assert "ORGANIZATION (employer)" in prompt
    assert "Transparent compensation" not in prompt
    assert "Clear job expectations" not in prompt
    assert "Do NOT flag missing job salary" in prompt
    assert "GOVERNANCE GATE" in prompt
    assert ORG_EVALUATION_CRITERIA in prompt


def test_governance_gate_forces_for_profit_weak_yes_to_no():
    result = _parse_response(
        _assessment_json(
            canonical_name="Aliments Prémont Inc.",
            slug="aliments-premont-inc",
            type="other",
            sse_rating="weak_yes",
            sse_reasoning=(
                "Mission mentions respect for individuals and the environment."
            ),
        ),
        "Aliments Prémont Inc.",
    )
    assert result is not None
    assert result["sse_rating"] == "no"
    assert any("governance_gate" in f for f in result["flags"])
    assert "Overridden to 'no'" in result["sse_reasoning"]


def test_governance_gate_keeps_nonprofit_yes():
    result = _parse_response(
        _assessment_json(type="nonprofit", sse_rating="strong_yes"),
        "Nature Visuals",
    )
    assert result is not None
    assert result["sse_rating"] == "strong_yes"
