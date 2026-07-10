"""Tests for organization assessment response parsing."""

import json

from utils.organization_assessment import (
    _ORG_DESCRIPTION_MAX_CHARS,
    _SSE_REASONING_MAX_CHARS,
    _parse_response,
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


def test_parse_response_keeps_long_sse_reasoning():
    reasoning = (
        "The organization's core mission is to promote conservation and science education "
        "through visual storytelling, directly aligning with social and environmental "
        "well-being. They collaborate with various community partners and publish "
        "educational materials that prioritize people and planet over profit."
    )
    assert len(reasoning) > 200
    assert len(reasoning) <= _SSE_REASONING_MAX_CHARS

    result = _parse_response(_assessment_json(sse_reasoning=reasoning), "Nature Visuals")

    assert result is not None
    assert result["sse_reasoning"] == reasoning


def test_parse_response_caps_sse_reasoning_at_limit():
    reasoning = "x" * (_SSE_REASONING_MAX_CHARS + 50)
    result = _parse_response(_assessment_json(sse_reasoning=reasoning), "Nature Visuals")

    assert result is not None
    assert len(result["sse_reasoning"]) == _SSE_REASONING_MAX_CHARS


def test_parse_response_allows_description_up_to_admin_limit():
    description = "y" * _ORG_DESCRIPTION_MAX_CHARS
    result = _parse_response(_assessment_json(description=description), "Nature Visuals")

    assert result is not None
    assert result["description"] == description
