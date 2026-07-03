"""Tests for OrganizationIdentifier.

Property 5: LLM response validation is complete.
Property 6: Org identifier prompt includes all required context.

Validates: Requirements 2.5, 4.1, 4.5
"""

import json
from unittest.mock import MagicMock, patch

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from utils.organization_identifier import (
    _PROMPT_DESC_MAX_CHARS,
    ORG_TYPE_VALUES,
    OrganizationIdentifier,
)

# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_valid_response(**overrides) -> str:
    data = {
        "canonical_name": "Test Organization",
        "slug": "test-organization",
        "website": "https://example.com",
        "description": "A test org",
        "type": "nonprofit",
    }
    data.update(overrides)
    return json.dumps(data)


def _make_identifier(response_text: str) -> OrganizationIdentifier:
    """Return an OrganizationIdentifier with a mocked provider."""
    identifier = OrganizationIdentifier.__new__(OrganizationIdentifier)
    mock_provider = MagicMock()
    mock_provider.complete.return_value = response_text
    identifier.provider = mock_provider
    return identifier


# ── Constructor tests ─────────────────────────────────────────────────────────


class TestConstructor:
    @patch("utils.organization_identifier.get_sse_provider", return_value=None)
    def test_raises_when_provider_unavailable(self, mock_provider):
        with pytest.raises(RuntimeError, match="SSE provider not available"):
            OrganizationIdentifier()

    @patch("utils.organization_identifier.get_sse_provider", side_effect=RuntimeError("provider init failed"))
    def test_lets_provider_init_failure_propagate(self, mock_provider):
        with pytest.raises(RuntimeError, match="provider init failed"):
            OrganizationIdentifier()


# ── Parse response (validation) tests ────────────────────────────────────────


class TestParseResponse:
    def test_valid_response_returns_result(self):
        identifier = _make_identifier(_make_valid_response())
        result = identifier._parse_response(_make_valid_response(), "raw")
        assert result is not None
        assert result["canonical_name"] == "Test Organization"

    def test_invalid_json_returns_none(self):
        identifier = _make_identifier("")
        result = identifier._parse_response("not json at all {{{", "raw")
        assert result is None

    def test_missing_canonical_name_returns_none(self):
        data = {"slug": "test", "website": None, "description": None, "type": None}
        identifier = _make_identifier(json.dumps(data))
        result = identifier._parse_response(json.dumps(data), "raw")
        assert result is None

    def test_empty_canonical_name_returns_none(self):
        data = {"canonical_name": "", "slug": "test", "website": None, "description": None, "type": None}
        identifier = _make_identifier(json.dumps(data))
        result = identifier._parse_response(json.dumps(data), "raw")
        assert result is None

    def test_whitespace_only_canonical_name_returns_none(self):
        data = {"canonical_name": "   ", "slug": "test", "website": None, "description": None, "type": None}
        identifier = _make_identifier(json.dumps(data))
        result = identifier._parse_response(json.dumps(data), "raw")
        assert result is None

    def test_strips_markdown_fences(self):
        wrapped = "```json\n" + _make_valid_response() + "\n```"
        identifier = _make_identifier(wrapped)
        result = identifier._parse_response(wrapped, "raw")
        assert result is not None
        assert result["canonical_name"] == "Test Organization"

    def test_strips_fences_with_preamble(self):
        """LLM may include explanatory text before/after the code block."""
        wrapped = "Here is the result:\n```json\n" + _make_valid_response() + "\n```\nHope this helps."
        identifier = _make_identifier(wrapped)
        result = identifier._parse_response(wrapped, "raw")
        assert result is not None
        assert result["canonical_name"] == "Test Organization"

    def test_description_capped_at_300_chars(self):
        long_desc = "x" * 500
        response = _make_valid_response(description=long_desc)
        identifier = _make_identifier(response)
        result = identifier._parse_response(response, "raw")
        assert result is not None
        assert len(result["description"]) == 300

    def test_invalid_type_becomes_none(self):
        response = _make_valid_response(type="invalid_type_xyz")
        identifier = _make_identifier(response)
        result = identifier._parse_response(response, "raw")
        assert result is not None
        assert result["type"] is None

    def test_valid_types_accepted(self):
        for org_type in ORG_TYPE_VALUES:
            response = _make_valid_response(type=org_type)
            identifier = _make_identifier(response)
            result = identifier._parse_response(response, "raw")
            assert result is not None
            assert result["type"] == org_type

    def test_non_dict_json_returns_none(self):
        identifier = _make_identifier("[]")
        result = identifier._parse_response("[]", "raw")
        assert result is None


# ── identify() tests ──────────────────────────────────────────────────────────


class TestIdentify:
    def test_returns_result_on_valid_llm_response(self):
        response = _make_valid_response()
        identifier = _make_identifier(response)
        result = identifier.identify("Test Org", "Montreal", "QC", "Developer", "A description")
        assert result is not None
        assert result["canonical_name"] == "Test Organization"

    def test_returns_none_on_llm_exception(self):
        identifier = OrganizationIdentifier.__new__(OrganizationIdentifier)
        mock_provider = MagicMock()
        mock_provider.complete.side_effect = Exception("network error")
        identifier.provider = mock_provider
        result = identifier.identify("Test Org", "Montreal", "QC", "Developer", "Description")
        assert result is None

    def test_description_truncated_in_prompt(self):
        """The job description sent to the LLM must be at most 1000 chars."""
        # Use a distinguishable sentinel beyond the cutoff
        long_desc = "A" * _PROMPT_DESC_MAX_CHARS + "SENTINEL_BEYOND_CUTOFF"
        identifier = OrganizationIdentifier.__new__(OrganizationIdentifier)
        mock_provider = MagicMock()
        mock_provider.complete.return_value = _make_valid_response()
        identifier.provider = mock_provider

        identifier.identify("Org", "City", "QC", "Title", long_desc)

        call_args = mock_provider.complete.call_args
        prompt_sent = call_args[0][0]  # first positional arg
        # Truncated portion must appear (up to limit)
        assert "A" * 100 in prompt_sent  # some of the description is present
        # Sentinel beyond the cutoff must NOT appear
        assert "SENTINEL_BEYOND_CUTOFF" not in prompt_sent

    def test_prompt_includes_raw_name(self):
        identifier = OrganizationIdentifier.__new__(OrganizationIdentifier)
        mock_provider = MagicMock()
        mock_provider.complete.return_value = _make_valid_response()
        identifier.provider = mock_provider

        identifier.identify("Unique Org Name XYZ", "Montreal", "QC", "Dev", "desc")
        prompt = mock_provider.complete.call_args[0][0]
        assert "Unique Org Name XYZ" in prompt

    def test_prompt_includes_municipality_and_province(self):
        identifier = OrganizationIdentifier.__new__(OrganizationIdentifier)
        mock_provider = MagicMock()
        mock_provider.complete.return_value = _make_valid_response()
        identifier.provider = mock_provider

        identifier.identify("Org", "Sherbrooke", "QC", "Title", "desc")
        prompt = mock_provider.complete.call_args[0][0]
        assert "Sherbrooke" in prompt
        assert "QC" in prompt

    def test_prompt_includes_job_title(self):
        identifier = OrganizationIdentifier.__new__(OrganizationIdentifier)
        mock_provider = MagicMock()
        mock_provider.complete.return_value = _make_valid_response()
        identifier.provider = mock_provider

        identifier.identify("Org", "City", "ON", "Unique Job Title ABC", "desc")
        prompt = mock_provider.complete.call_args[0][0]
        assert "Unique Job Title ABC" in prompt


# ── Property-based tests ──────────────────────────────────────────────────────

# Feature: organizations, Property 5: LLM response validation is complete
@given(
    response=st.one_of(
        # Valid JSON with canonical_name
        st.fixed_dictionaries({
            "canonical_name": st.text(min_size=1, max_size=100),
            "slug": st.text(min_size=0, max_size=80),
            "website": st.one_of(st.none(), st.just("https://example.com")),
            "description": st.one_of(st.none(), st.text(max_size=300)),
            "type": st.one_of(st.none(), st.sampled_from(list(ORG_TYPE_VALUES))),
        }).map(json.dumps),
        # Arbitrary text (usually invalid JSON or missing canonical_name)
        st.text(max_size=500),
    )
)
@settings(max_examples=400)
def test_parse_response_validation_completeness(response: str):
    """Property 5: Validator returns non-None iff parseable JSON with non-empty canonical_name."""
    identifier = _make_identifier(response)
    result = identifier._parse_response(response, "raw_name")

    # Attempt to parse as JSON ourselves to verify the contract
    try:
        data = json.loads(response)
        has_canonical = (
            isinstance(data, dict)
            and bool(str(data.get("canonical_name") or "").strip())
        )
    except (json.JSONDecodeError, Exception):
        has_canonical = False

    if has_canonical:
        assert result is not None, f"Expected non-None result for valid response: {response[:100]}"
    else:
        assert result is None, f"Expected None for invalid response: {response[:100]}"


# Feature: organizations, Property 6: Org identifier prompt includes all required context
@given(
    raw_name=st.text(min_size=1, max_size=100),
    municipality=st.one_of(st.none(), st.text(min_size=1, max_size=50)),
    province=st.one_of(st.none(), st.text(min_size=1, max_size=20)),
    job_title=st.text(min_size=1, max_size=100),
    description=st.text(min_size=0, max_size=2000),
)
@settings(max_examples=200)
def test_prompt_includes_required_context(raw_name, municipality, province, job_title, description):
    """Property 6: Prompt contains raw name, municipality, province, job title, and ≤1000 chars of description."""
    identifier = OrganizationIdentifier.__new__(OrganizationIdentifier)
    mock_provider = MagicMock()
    mock_provider.complete.return_value = _make_valid_response()
    identifier.provider = mock_provider

    identifier.identify(raw_name, municipality, province, job_title, description)

    prompt = mock_provider.complete.call_args[0][0]

    assert raw_name in prompt
    if municipality:
        assert municipality in prompt
    if province:
        assert province in prompt
    assert job_title in prompt
    # Description must be truncated to _PROMPT_DESC_MAX_CHARS
    truncated_desc = description[:_PROMPT_DESC_MAX_CHARS]
    if truncated_desc:
        assert truncated_desc in prompt
    # Full description beyond limit must NOT appear in prompt — use a unique suffix check
    if len(description) > _PROMPT_DESC_MAX_CHARS + 10:
        # Check a unique 10-char window that only exists beyond the cutoff
        beyond = description[_PROMPT_DESC_MAX_CHARS: _PROMPT_DESC_MAX_CHARS + 10]
        # Only assert if that window isn't also present earlier in the string
        if beyond not in description[:_PROMPT_DESC_MAX_CHARS]:
            assert beyond not in prompt
