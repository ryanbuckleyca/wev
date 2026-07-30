"""Tests for organization assessment response parsing."""

import json
from unittest.mock import MagicMock, patch

from utils.organization_assessment import (
    _attach_org_language,
    _build_search_query,
    _parse_response,
    _parse_website,
)
from utils.organization_language import LanguageClassification


@patch("utils.organization_assessment.classify_org_language")
def test_english_name_yields_to_research_public_language(mock_classify):
    mock_classify.return_value = LanguageClassification("en", 0.7, "llm_name", ("name_llm=en",))
    row = _attach_org_language(
        {"name": "Acme Foundation", "website": None, "sse_details": {"flags": []}},
        "fr",
    )
    assert row["language"] == "fr"
    flags = row["sse_details"]["flags"]
    assert "language:fr via=public_language" in flags
    assert "language_reason:name_llm=en" in flags


@patch("utils.organization_assessment.classify_org_language")
def test_french_name_beats_english_public_language(mock_classify):
    mock_classify.return_value = LanguageClassification("fr", 0.7, "llm_name", ("name_llm=fr",))
    row = _attach_org_language({"name": "Fondation Acme", "website": None}, "en")
    assert row["language"] == "fr"
    assert "language:fr via=llm_name" in row["sse_details"]["flags"]


@patch("utils.organization_assessment.classify_org_language")
def test_confirmed_english_website_not_overridden_by_public_language(mock_classify):
    mock_classify.return_value = LanguageClassification(
        "en", 0.85, "web_text", ("web_signal=en",)
    )
    row = _attach_org_language({"name": "Acme", "website": "https://x.org"}, "fr")
    assert row["language"] == "en"
    assert "language:en via=web_text" in row["sse_details"]["flags"]


@patch("utils.organization_assessment.classify_org_language")
def test_public_language_used_when_no_name_or_web_signal(mock_classify):
    mock_classify.return_value = LanguageClassification(None, 0.0, "unknown", ())
    row = _attach_org_language({"name": "Neutral Co", "website": None}, "bilingual")
    assert row["language"] == "bilingual"
    assert "language:bilingual via=public_language" in row["sse_details"]["flags"]


@patch("utils.organization_assessment.classify_org_language")
def test_existing_language_never_overwritten_by_attach(mock_classify):
    row = _attach_org_language(
        {"name": "X", "website": None, "language": "fr", "sse_details": {"flags": ["values via=inferred"]}},
        "en",
    )
    assert row["language"] == "fr"
    mock_classify.assert_not_called()
    assert "language:fr via=kept" in row["sse_details"]["flags"]
    assert "values via=inferred" in row["sse_details"]["flags"]


def _assessment_json(**overrides) -> str:
    payload = {
        "canonical_name": "Nature Visuals",
        "slug": "nature-visuals",
        "website": "https://example.org",
        "description_en": "A short description.",
        "description_fr": "Une courte description.",
        "mission_statement_en": "Promote conservation through storytelling.",
        "mission_statement_fr": "Promouvoir la conservation par le récit.",
        "type": "nonprofit",
        "values_raw": None,
        "values": ["Help Society"],
        "sse_rating": "strong_yes",
        "sse_confidence": 0.9,
        "sse_reasoning_en": "Aligned with SSE.",
        "sse_reasoning_fr": "Aligné avec l'ESS.",
        "must_haves_met": ["Clear purpose beyond profit"],
        "nice_to_haves_met": [],
        "flags": [],
        "public_language": None,
    }
    payload.update(overrides)
    return json.dumps(payload)


def test_parse_response_keeps_over_limit_text_until_truncate():
    """Parse does not truncate; oversize detection is for _smart_truncate."""
    from utils.organization_assessment import (
        _ORG_DESCRIPTION_MAX_CHARS,
        _SSE_REASONING_MAX_CHARS,
        _fields_over_limit,
    )

    reasoning = ("word " * 200).strip()
    description = "y" * 1200
    assert len(reasoning) > _SSE_REASONING_MAX_CHARS
    assert len(description) > _ORG_DESCRIPTION_MAX_CHARS

    result = _parse_response(
        _assessment_json(sse_reasoning_en=reasoning, description_en=description),
        "Nature Visuals",
    )

    assert result is not None
    assert result["sse_reasoning_en"] == reasoning
    assert result["description_en"] == description
    over = _fields_over_limit(result)
    assert "sse_reasoning_en" in over
    assert "description_en" in over


@patch('utils.organization_assessment.get_sse_provider')
def test_ensure_length_limits_truncates_oversize_fields(mock_get_sse_provider):
    from utils.organization_assessment import (
        _ORG_DESCRIPTION_MAX_CHARS,
        AssessedOrgResult,
        OrganizationAssessor,
        _fields_over_limit,
    )

    mock_get_sse_provider.return_value = MagicMock() # Mock the provider

    assessor = OrganizationAssessor()

    long_desc = "y" * 1200
    result = AssessedOrgResult(
        canonical_name="Nature Visuals",
        slug="nature-visuals",
        website="https://example.org",
        description_en=long_desc,
        description_fr=None,
        mission_statement_en=None,
        mission_statement_fr=None,
        type="nonprofit",
        sector_id=None,
        values_raw=None,
        values=[],
        sse_rating="no",
        sse_confidence=0.5,
        sse_reasoning_en=None,
        sse_reasoning_fr=None,
        must_haves_met=[],
        nice_to_haves_met=[],
        flags=[],
        public_language=None,
    )

    fixed = assessor._ensure_length_limits(result, "Nature Visuals")

    assert fixed is not None
    assert len(fixed["description_en"]) <= _ORG_DESCRIPTION_MAX_CHARS
    assert "length_limit: truncated description_en" in fixed["flags"]
    assert not _fields_over_limit(fixed)


def test_omit_null_locale_fields_keeps_existing_fr_on_reassess():
    from utils.organization_assessment import (
        _omit_null_locale_fields_from_update,
        _result_to_db_fields,
    )

    result = _parse_response(
        _assessment_json(
            description_en="English only this pass.",
            description_fr=None,
            mission_statement_en="English mission.",
            mission_statement_fr=None,
            sse_reasoning_en="English reasoning.",
            sse_reasoning_fr=None,
        ),
        "Nature Visuals",
    )
    assert result is not None
    assert result["description_fr"] is None
    assert result["sse_reasoning_fr"] is None

    updates = _omit_null_locale_fields_from_update(_result_to_db_fields(result))
    assert updates["description_en"] == "English only this pass."
    assert "description_fr" not in updates
    assert "mission_statement_fr" not in updates
    assert updates["description"] == "English only this pass."


def test_merge_sse_details_preserves_prior_fr_reasoning():
    from utils.organization_assessment import (
        _merge_sse_details_preserving_reasoning,
        _result_to_db_fields,
    )

    result = _parse_response(
        _assessment_json(
            sse_reasoning_en="New English reasoning.",
            sse_reasoning_fr=None,
        ),
        "Nature Visuals",
    )
    assert result is not None
    updates = _merge_sse_details_preserving_reasoning(
        _result_to_db_fields(result),
        {
            "reasoning_en": "Old English",
            "reasoning_fr": "Ancien raisonnement français.",
            "reasoning": "Old English",
        },
    )
    details = updates["sse_details"]
    assert details["reasoning_en"] == "New English reasoning."
    assert details["reasoning_fr"] == "Ancien raisonnement français."
    assert details["reasoning"] == "New English reasoning."


def test_parse_response_does_not_invent_missing_reasoning_locale():
    result = _parse_response(
        _assessment_json(sse_reasoning_en="Only English.", sse_reasoning_fr=None),
        "Nature Visuals",
    )
    assert result is not None
    assert result["sse_reasoning_en"] == "Only English."
    assert result["sse_reasoning_fr"] is None


def test_org_assessment_prompt_requires_evidence_not_type_label_alone():
    from utils.organization_assessment import _build_assessment_prompt

    prompt = _build_assessment_prompt(
        "Acme Inc.",
        "Montreal",
        "QC",
        job_title="Cook",
        description="listing notes",
    )
    assert "evidence over labels" in prompt
    assert "NOT from the \"type\" string alone" in prompt
    assert "Base the rating on mission/governance evidence" in prompt


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
    assert "Never cut off mid-word or mid-sentence" in prompt
    assert "paraphrase and condense" in prompt
    assert "Do NOT restate must_haves_met" in prompt
    assert "Reasoning must be brief (2–4 sentences)" in prompt
    assert "MUST fit within" in prompt
    assert "description_en" in prompt and "description_fr" in prompt
    assert "BILINGUAL PUBLIC COPY" in prompt


def test_org_assessment_prompt_prioritizes_name_then_bilingual_website_evidence():
    from utils.organization_assessment import _build_assessment_prompt

    prompt = _build_assessment_prompt(
        "Aliments Prémont Inc.",
        "Sainte-Angèle-de-Prémont",
        "QC",
        job_title="Coordinator",
        description="listing notes",
    )
    assert "organization name as the strongest indication" in prompt
    assert "website confirms substantial materials in both English and French" in prompt


def test_parse_website_keeps_employer_owned_host():
    assert _parse_website("https://www.mindrift.ai/about") == "https://www.mindrift.ai/about"
    assert _parse_website("mindrift.ai") == "https://mindrift.ai"


def test_parse_website_rejects_shared_hosts():
    assert _parse_website("https://boards.greenhouse.io/acme") is None
    assert _parse_website("https://facebook.com/acme-org") is None
    assert _parse_website("https://www.linkedin.com/company/acme") is None


def test_parse_response_defaults_missing_content_provenance_to_inferred():
    """Model omitted provenance flags — populated fields default to via=inferred."""
    result = _parse_response(
        _assessment_json(flags=[]),
        "Nature Visuals",
    )
    assert result is not None
    assert "description via=inferred" in result["flags"]
    assert "mission via=inferred" in result["flags"]
    assert "values via=inferred" in result["flags"]


def test_parse_response_keeps_explicit_extracted_provenance():
    result = _parse_response(
        _assessment_json(
            flags=[
                "description via=extracted",
                "mission via=extracted",
                "values via=extracted",
            ],
        ),
        "Nature Visuals",
    )
    assert result is not None
    assert "description via=extracted" in result["flags"]
    assert "description via=inferred" not in result["flags"]
    assert "mission via=inferred" not in result["flags"]
    assert "values via=inferred" not in result["flags"]


def test_parse_response_normalizes_legacy_inferred_flags():
    result = _parse_response(
        _assessment_json(
            flags=["description_inferred", "mission_extracted", "values_inferred"],
        ),
        "Nature Visuals",
    )
    assert result is not None
    assert "description via=inferred" in result["flags"]
    assert "mission via=extracted" in result["flags"]
    assert "values via=inferred" in result["flags"]
    assert "description_inferred" not in result["flags"]


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
            sse_reasoning_en=(
                "Mission mentions respect for individuals and the environment."
            ),
        ),
        "Aliments Prémont Inc.",
    )
    assert result is not None
    assert result["sse_rating"] == "no"
    assert any("governance_gate" in f for f in result["flags"])


def test_governance_gate_keeps_nonprofit_yes():
    result = _parse_response(
        _assessment_json(type="nonprofit", sse_rating="strong_yes"),
        "Nature Visuals",
    )
    assert result is not None
    assert result["sse_rating"] == "strong_yes"


def test_org_assessment_prompt_excludes_government_from_sse():
    from utils.organization_assessment import _build_assessment_prompt

    prompt = _build_assessment_prompt("City of Ottawa", "Ottawa", "ON", "", "")
    assert "Government" in prompt or "government" in prompt
    assert "Public service is not SSE" in prompt or "public-sector" in prompt.lower()


def test_org_assessment_prompt_rejects_mission_only_private_enterprise():
    """Mission-driven private schools must be typed other, not invented SE."""
    from utils.organization_assessment import _build_assessment_prompt

    prompt = _build_assessment_prompt("Toronto Nature School", "Toronto", "ON", "", "")
    assert "Mission-driven private enterprise is not SSE" in prompt
    assert 'There is no "social enterprise" type' in prompt
    assert "type alone is never sufficient" in prompt or "Type is necessary but not sufficient" in prompt


def test_normalize_type_maps_social_enterprise_to_other():
    from utils.organization_assessment import _normalize_type

    assert _normalize_type("social enterprise") == "other"
    assert _normalize_type("Social Enterprise") == "other"


def test_governance_gate_forces_government_yes_to_no():
    """Public-sector orgs are not SSE governance forms (intentional)."""
    result = _parse_response(
        _assessment_json(
            type="government",
            sse_rating="strong_yes",
            sse_reasoning_en="Public agency serving community needs.",
        ),
        "City Parks Department",
    )
    assert result is not None
    assert result["sse_rating"] == "no"
    assert any("governance_gate" in f for f in result["flags"])


def test_governance_gate_keeps_yes_when_type_is_null():
    """Null type means unknown — do not demote a model Yes."""
    result = _parse_response(
        _assessment_json(
            type=None,
            sse_rating="strong_yes",
            sse_reasoning_en="Clear community ownership and mission.",
        ),
        "Mystery Mutual",
    )
    assert result is not None
    assert result["sse_rating"] == "strong_yes"
    assert not any("governance_gate" in f for f in result["flags"])


def test_governance_gate_forces_other_yes_to_no():
    result = _parse_response(
        _assessment_json(
            type="other",
            sse_rating="weak_yes",
            sse_reasoning_en="Mentions environment in CSR copy.",
        ),
        "Acme Inc.",
    )
    assert result is not None
    assert result["sse_rating"] == "no"
    assert any("governance_gate" in f for f in result["flags"])


def test_governance_gate_keeps_aliased_mutual_forms_as_nonprofit_yes():
    """Model may say mutual/community; we store nonprofit and keep Yes."""
    for raw_type in ("mutual", "community", "mutual-aid"):
        result = _parse_response(
            _assessment_json(
                type=raw_type,
                sse_rating="strong_yes",
                sse_reasoning_en="Member-owned mutual support structure.",
            ),
            "Grassroots Org",
        )
        assert result is not None
        assert result["type"] == "nonprofit"
        assert result["sse_rating"] == "strong_yes"
        assert not any("governance_gate" in f for f in result["flags"])


def test_normalize_type_aliases_mutual_and_community_to_nonprofit():
    from utils.organization_assessment import _normalize_type

    assert _normalize_type("mutual-aid") == "nonprofit"
    assert _normalize_type("Mutual Aid Group") == "nonprofit"
    assert _normalize_type("community association") == "nonprofit"
    assert _normalize_type("community_project") == "nonprofit"
    assert _normalize_type("credit union") == "cooperative"
