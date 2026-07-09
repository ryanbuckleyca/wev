"""Tests for OrganizationAssessor JSON parsing and retry behavior."""

from unittest.mock import MagicMock, patch

from utils.organization_assessment import (
    OrganizationAssessor,
    _build_assessment_prompt,
    _parse_response,
)


def test_build_assessment_prompt_uses_org_criteria_not_job_posting_criteria():
    prompt = _build_assessment_prompt(
        "Doctors Without Borders",
        "Montreal",
        "QC",
        "Specialist Physician",
        "Narrow role-specific posting",
    )
    assert "EMPLOYER ORGANIZATION" in prompt
    assert "ORGANIZATION EVALUATION CRITERIA" in prompt
    assert "Role contributes to social/community/environmental good" not in prompt
    assert "Never refuse to answer" in prompt


def test_parse_response_accepts_valid_json():
    result = _parse_response(
        """{
          "canonical_name": "Doctors Without Borders Canada",
          "slug": "doctors-without-borders-canada",
          "website": "https://www.msf.ca",
          "description": "Humanitarian medical organization",
          "mission_statement": "Provide medical aid where it is needed most",
          "type": "nonprofit",
          "values_raw": "humanitarian aid, solidarity",
          "values": ["Help Society", "Community"],
          "sse_rating": "strong_yes",
          "sse_confidence": 0.9,
          "sse_reasoning": "Nonprofit humanitarian mission",
          "must_haves_met": ["mission"],
          "nice_to_haves_met": [],
          "flags": []
        }""",
        "MSF",
    )
    assert result is not None
    assert result["canonical_name"] == "Doctors Without Borders Canada"
    assert result["values"] == ["Help Society", "Community"]
    assert result["sse_rating"] == "strong_yes"


def test_parse_response_rejects_prose():
    result = _parse_response(
        "I am sorry, but I cannot fulfill this request.",
        "MSF",
    )
    assert result is None


def test_assess_retries_when_first_response_is_not_json():
    assessor = OrganizationAssessor.__new__(OrganizationAssessor)
    assessor.provider = MagicMock()

    valid_json = """{
      "canonical_name": "Regroupement Example",
      "slug": "regroupement-example",
      "website": null,
      "description": "Community education nonprofit",
      "mission_statement": null,
      "type": "nonprofit",
      "values_raw": null,
      "values": [],
      "sse_rating": "weak_yes",
      "sse_confidence": 0.6,
      "sse_reasoning": "Mission-driven nonprofit",
      "must_haves_met": [],
      "nice_to_haves_met": [],
      "flags": ["limited public info"]
    }"""

    with patch.object(
        OrganizationAssessor,
        "_call_assessor",
        side_effect=["I need a website URL first.", valid_json],
    ) as mock_call:
        result = assessor.assess(raw_name="Regroupement Example")

    assert result is not None
    assert result["canonical_name"] == "Regroupement Example"
    assert mock_call.call_count == 2
    assert mock_call.call_args_list[1].kwargs["retry"] is True


def test_assess_uses_fallback_when_both_llm_calls_return_empty():
    assessor = OrganizationAssessor.__new__(OrganizationAssessor)
    assessor.provider = MagicMock()

    with patch.object(
        OrganizationAssessor,
        "_call_assessor",
        side_effect=["", ""],
    ) as mock_call:
        result = assessor.assess(raw_name="Rolls-Royce")

    assert result is not None
    assert result["canonical_name"] == "Rolls-Royce"
    assert result["sse_rating"] == "no"
    assert "llm_empty_or_invalid_json" in result["flags"]
    assert mock_call.call_count == 2
