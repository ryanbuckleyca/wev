"""Tests for organization assessment response parsing."""

import json

from utils.organization_assessment import (
    _ORG_DESCRIPTION_MAX_CHARS,
    _SSE_REASONING_MAX_CHARS,
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
    reasoning = ("word " * 300).strip()
    assert len(reasoning) > _SSE_REASONING_MAX_CHARS

    result = _parse_response(_assessment_json(sse_reasoning=reasoning), "Nature Visuals")

    assert result is not None
    assert len(result["sse_reasoning"]) <= _SSE_REASONING_MAX_CHARS
    assert not result["sse_reasoning"].endswith("wo")


def test_parse_response_allows_description_up_to_admin_limit():
    description = "y" * _ORG_DESCRIPTION_MAX_CHARS
    result = _parse_response(_assessment_json(description=description), "Nature Visuals")

    assert result is not None
    assert result["description"] == description


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
