"""Tests for organization assessment response parsing."""

import json
from unittest.mock import MagicMock, patch

import pytest

from utils.organization_assessment import (
    _attach_org_language,
    _build_assessment_prompt,
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
        "flags": [
            "description via=extracted",
            "mission via=extracted",
            "values via=extracted",
        ],
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
        geographic_scope=None,
        headquarters_municipality=None,
        headquarters_province=None,
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
    assert "Priority for public_language" in prompt
    assert "Organization name only as weak evidence" in prompt
    assert "substantial English AND French" in prompt


def test_parse_website_keeps_employer_owned_host():
    assert _parse_website("https://www.mindrift.ai/about") == "https://www.mindrift.ai/about"
    assert _parse_website("mindrift.ai") == "https://mindrift.ai"


def test_parse_website_accepts_shared_hosts_for_org_identity():
    """Shared platform URLs are now accepted for org identity tracking."""
    assert _parse_website("https://boards.greenhouse.io/acme") == "https://boards.greenhouse.io/acme"
    assert _parse_website("https://facebook.com/acme-org") == "https://facebook.com/acme-org"
    assert _parse_website("https://www.linkedin.com/company/acme") == "https://www.linkedin.com/company/acme"


def test_parse_response_defaults_missing_content_provenance_to_inferred():
    """Model omitted provenance flags — populated fields default to via=inferred, except mission which becomes absent."""
    result = _parse_response(
        _assessment_json(flags=[]),
        "Nature Visuals",
    )
    assert result is not None
    assert "description via=inferred" in result["flags"]
    assert "mission via=absent" in result["flags"]  # Mission cannot be inferred
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


def test_parse_response_accepts_shared_website_for_identity():
    """Shared platform URLs are now accepted for org identity tracking."""
    result = _parse_response(
        _assessment_json(website="https://boards.greenhouse.io/nature-visuals"),
        "Nature Visuals",
    )
    assert result is not None
    assert result["website"] == "https://boards.greenhouse.io/nature-visuals"


def test_apply_website_known_guard_trusts_discovered_url():
    """With Tavily grounding, discovered URLs are now trusted over known URLs."""
    from utils.organization_assessment import _apply_website_known_guard

    result = _parse_response(
        _assessment_json(website="https://discovered-example.org"),
        "Nature Visuals",
    )
    assert result is not None
    guarded = _apply_website_known_guard(result, "https://old-known.org")
    # Now trusts the discovered URL from Tavily
    assert guarded["website"] == "https://discovered-example.org"
    # Flags the update for auditing
    assert any("website_updated" in str(f) for f in (guarded.get("flags") or []))


def test_build_search_query_does_not_mention_official_website():
    """Search query no longer includes 'official website' to avoid biasing toward generic content."""
    assert _build_search_query("Mindrift", "Toronto", "ON") == (
        '"Mindrift" Toronto, ON, Canada'
    )


def test_build_search_query_includes_known_website():
    """Known website still included in search query but without 'official website' phrase."""
    assert _build_search_query(
        "Gates Foundation",
        known_website="https://www.gatesfoundation.org/",
    ) == (
        '"Gates Foundation" Canada https://www.gatesfoundation.org/'
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
    # Job must-haves 4–5 must not appear as numbered org criteria.
    assert "4. Transparent compensation" not in prompt
    assert "5. Clear job expectations" not in prompt
    assert "Do NOT flag missing job salary" in prompt
    assert 'Do NOT put "Transparent compensation"' in prompt
    assert "ORG MUST-HAVES / NICE-TO-HAVES LABELS" in prompt
    assert "GOVERNANCE GATE" in prompt
    assert ORG_EVALUATION_CRITERIA in prompt


def test_org_parse_strips_job_leaked_must_haves():
    result = _parse_response(
        _assessment_json(
            canonical_name="Community Hub",
            slug="community-hub",
            type="nonprofit",
            sse_rating="strong_yes",
            must_haves_met=[
                "Clear purpose beyond profit",
                "Transparent compensation",
                "Clear job expectations",
            ],
            nice_to_haves_met=["Participatory governance", "salary disclosure"],
        ),
        "Community Hub",
    )
    assert result is not None
    assert result["must_haves_met"] == ["Clear purpose beyond profit"]
    assert result["nice_to_haves_met"] == ["Participatory governance"]


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
    assert _normalize_type("worker-owned") == "cooperative"
    assert _normalize_type("worker coop") == "cooperative"
    assert _normalize_type("worker cooperative") == "cooperative"
    assert _normalize_type("coop") == "cooperative"


def test_org_assessment_prompt_charity_community_nonprofit_floor():
    """Charities/community env nonprofits → nonprofit + ≥weak_yes, not other/no."""
    from utils.organization_assessment import _build_assessment_prompt

    prompt = _build_assessment_prompt(
        "Community Ecology Centre",
        "Norval",
        "ON",
        job_title="",
        description="",
    )
    assert "charities are never \"other\" for lacking cooperative governance" in prompt
    assert 'AT LEAST "weak_yes"' in prompt
    assert "board+ED charities stay nonprofit" in prompt or (
        "board + executive director is still nonprofit" in prompt
    )
    assert "NEVER rate a registered charity" in prompt


def test_org_assessment_prompt_mutual_aid_strong_yes_calibration():
    from utils.organization_assessment import _build_assessment_prompt

    prompt = _build_assessment_prompt(
        "Service d'entraide communautaire",
        "Montreal",
        "QC",
        "",
        "",
    )
    assert "mutual-aid, collective care, or solidarity" in prompt
    assert "flat or non-hierarchical structure" in prompt
    assert "Explicit cooperative labels are NOT required for strong_yes" in prompt


def test_org_assessment_prompt_political_parties_are_other_not_government():
    from utils.organization_assessment import _build_assessment_prompt

    prompt = _build_assessment_prompt(
        "Provincial Political Party",
        "Toronto",
        "ON",
        "",
        "",
    )
    assert "Political parties and electoral organizations" in prompt
    assert 'type "other", rating "no"' in prompt
    assert "parties are NOT 'government'" in prompt or "NOT political parties" in prompt
    # Must not instruct mapping parties to government
    assert "political parties are not public bodies" in prompt.lower() or (
        "NOT political parties — parties are not public bodies" in prompt
    )


def test_governance_gate_keeps_charity_nonprofit_weak_yes():
    """Simulates corrected charity assessment: nonprofit + weak_yes survives gate."""
    result = _parse_response(
        _assessment_json(
            canonical_name="Community Ecology Centre",
            slug="community-ecology-centre",
            type="nonprofit",
            sse_rating="weak_yes",
            sse_reasoning_en=(
                "Registered community environmental charity with clear public-benefit mission."
            ),
            must_haves_met=[
                "Clear purpose beyond profit",
                "Impact described intentionally",
                "Organization's work contributes to social/community/environmental good",
            ],
        ),
        "Community Ecology Centre",
    )
    assert result is not None
    assert result["type"] == "nonprofit"
    assert result["sse_rating"] == "weak_yes"
    assert not any("governance_gate" in f for f in result["flags"])


def test_result_to_db_fields_includes_evidence_website():
    from utils.organization_assessment import _result_to_db_fields

    result = _parse_response(
        _assessment_json(website="https://greencommunitiescanada.org"),
        "Green Communities Canada",
    )
    assert result is not None
    updates = _result_to_db_fields(result)
    assert updates.get("website") == "https://greencommunitiescanada.org"


def test_result_to_db_fields_omits_shared_host_website():
    """_result_to_db_fields still uses evidence_domain filter (historical behavior).

    Full website acceptance with flags happens in assess_and_build_update().
    """
    from utils.organization_assessment import _result_to_db_fields

    result = _parse_response(
        _assessment_json(website="https://linkedin.com/company/acme"),
        "Acme",
    )
    assert result is not None
    # After parsing, website is accepted
    assert result["website"] == "https://linkedin.com/company/acme"
    # But _result_to_db_fields still filters it (legacy behavior)
    updates = _result_to_db_fields(result)
    assert "website" not in updates


def test_assess_and_build_row_uses_hq_location_when_geocoding_hq():
    from utils.organization_assessment import OrganizationAssessor

    result = _parse_response(
        _assessment_json(
            headquarters_municipality="Ottawa",
            headquarters_province="ON",
        ),
        "Nature Visuals",
    )
    assert result is not None

    assessor = object.__new__(OrganizationAssessor)
    assessor.assess = MagicMock(return_value=result)

    with patch(
        "utils.organization_assessment.parse_address_with_geocodio",
        return_value={
            "municipality": "Ottawa",
            "province": "ON",
            "lat": 45.4215,
            "lng": -75.6972,
            "geocode_accuracy_type": "city",
        },
    ) as mock_geocode, patch(
        "utils.organization_assessment.classify_org_language",
        return_value=LanguageClassification(None, 0.0, "unknown", ()),
    ):
        row = assessor.assess_and_build_row(
            raw_name="Nature Visuals",
            municipality="Toronto",
            province="ON",
            canonical_loc="Toronto, ON",
        )

    mock_geocode.assert_called_once_with("Ottawa, ON")
    assert row is not None
    assert row["location"] == "Ottawa, ON"
    assert row["municipality"] == "Ottawa"
    assert row["province"] == "ON"
    assert row["lat"] == 45.4215
    assert row["lng"] == -75.6972


def test_assess_and_build_row_preserves_canonical_loc_when_only_province_hq():
    """Province-only LLM output must not clobber city-level canonical location.

    When headquarters_municipality is absent but headquarters_province is set,
    the assessor must keep the original canonical_loc for the `location`
    string, must NOT geocode the bare province string, and must preserve the
    municipality from the canonical fallback geocode while still applying
    the province validator to the final province value.
    """
    from utils.organization_assessment import OrganizationAssessor

    result = _parse_response(
        _assessment_json(
            headquarters_municipality=None,
            headquarters_province="ON",
        ),
        "Nature Visuals",
    )
    assert result is not None

    assessor = object.__new__(OrganizationAssessor)
    assessor.assess = MagicMock(return_value=result)

    with patch(
        "utils.organization_assessment.parse_address_with_geocodio",
        return_value={
            "municipality": "Toronto",
            "province": "ON",
            "lat": 43.6532,
            "lng": -79.3832,
            "geocode_accuracy_type": "city",
        },
    ) as mock_geocode, patch(
        "utils.organization_assessment.classify_org_language",
        return_value=LanguageClassification(None, 0.0, "unknown", ()),
    ):
        row = assessor.assess_and_build_row(
            raw_name="Nature Visuals",
            municipality="Toronto",
            province="ON",
            canonical_loc="Toronto, ON",
        )

    # Must not be called with bare province "ON"
    mock_geocode.assert_called_once_with("Toronto, ON")
    assert row is not None
    assert row["location"] == "Toronto, ON"
    assert row["municipality"] == "Toronto"
    assert row["province"] == "ON"
    assert row["lat"] == 43.6532
    assert row["lng"] == -79.3832


def test_private_company_gate_keeps_inc_charity_with_mission_no_cra():
    """Inc. + clear nonprofit mission (no CRA phrase) must stay Yes/nonprofit."""
    result = _parse_response(
        _assessment_json(
            canonical_name="Community Care Inc.",
            slug="community-care-inc",
            type="nonprofit",
            sse_rating="strong_yes",
            sse_reasoning_en=(
                "A mission-driven nonprofit with a clear public-benefit mandate "
                "serving vulnerable families; volunteer board oversees programs."
            ),
            must_haves_met=[
                "Clear purpose beyond profit",
                "Impact described intentionally",
                "Organization's work contributes to social/community/environmental good",
            ],
            flags=[],
        ),
        "Community Care Inc.",
    )
    assert result is not None
    assert result["type"] == "nonprofit"
    assert result["sse_rating"] == "strong_yes"
    assert not any("private_company_gate" in f for f in result["flags"])


def test_private_company_gate_keeps_inc_without_shareholders_soft_path():
    """'without shareholders' must not demote via bare shareholder match."""
    result = _parse_response(
        _assessment_json(
            canonical_name="Community Arts Collective Inc.",
            slug="community-arts-collective-inc",
            type="nonprofit",
            sse_rating="strong_yes",
            sse_reasoning_en=(
                "A mission-driven community arts group without shareholders; "
                "programs are overseen by a volunteer board."
            ),
            must_haves_met=[
                "Clear purpose beyond profit",
                "Impact described intentionally",
                "Organization's work contributes to social/community/environmental good",
            ],
            flags=[],
        ),
        "Community Arts Collective Inc.",
    )
    assert result is not None
    assert result["type"] == "nonprofit"
    assert result["sse_rating"] == "strong_yes"
    assert not any("private_company_gate" in f for f in result["flags"])


def test_private_company_gate_demotes_inc_with_commercial_ownership():
    """Inc. + private/commercial ownership language without charity → other/no."""
    result = _parse_response(
        _assessment_json(
            canonical_name="Family Music Programs Inc.",
            slug="family-music-programs-inc",
            type="nonprofit",
            sse_rating="weak_yes",
            sse_reasoning_en=(
                "A privately owned commercial music school offering fee-based "
                "private lessons; founder-owned studio with shareholders."
            ),
            must_haves_met=["Clear purpose beyond profit"],
            flags=[],
        ),
        "Family Music Programs Inc.",
    )
    assert result is not None
    assert result["type"] == "other"
    assert result["sse_rating"] == "no"
    assert any("private_company_gate" in f for f in result["flags"])


def test_private_company_gate_demotes_inc_commercial_despite_soft_mission_cues():
    """Private/commercial evidence must beat soft mission/board keep language."""
    result = _parse_response(
        _assessment_json(
            canonical_name="Harmony Music Academy Inc.",
            slug="harmony-music-academy-inc",
            type="nonprofit",
            sse_rating="weak_yes",
            sse_reasoning_en=(
                "A privately owned commercial for-profit music school with a "
                "mission-driven ethos and a board of directors overseeing programs."
            ),
            must_haves_met=["Clear purpose beyond profit"],
            flags=[],
        ),
        "Harmony Music Academy Inc.",
    )
    assert result is not None
    assert result["type"] == "other"
    assert result["sse_rating"] == "no"
    assert any("private_company_gate" in f for f in result["flags"])


def test_private_company_gate_keeps_community_service_language():
    """'Community recitals' matches soft nonprofit pattern and keeps the org."""
    result = _parse_response(
        _assessment_json(
            canonical_name="Melody Music School Inc.",
            slug="melody-music-school-inc",
            type="nonprofit",
            sse_rating="weak_yes",
            sse_reasoning_en=(
                "A nonprofit music school offering lessons and community "
                "recitals with a mission-driven approach."
            ),
            must_haves_met=["Clear purpose beyond profit"],
            flags=[],
        ),
        "Melody Music School Inc.",
    )
    assert result is not None
    # "community recitals" matches SOFT_NONPROFIT_EVIDENCE_RE pattern
    assert result["type"] == "nonprofit"
    assert result["sse_rating"] == "weak_yes"
    assert not any("private_company_gate" in f for f in result["flags"])


def test_private_company_gate_demotes_consulting_inc_without_strong_soft():
    """Consulting Inc. Yes with no private keywords and no strong soft → demote."""
    result = _parse_response(
        _assessment_json(
            canonical_name="Northwind Consulting Inc.",
            slug="northwind-consulting-inc",
            type="nonprofit",
            sse_rating="weak_yes",
            sse_reasoning_en=(
                "An environmental consulting firm helping clients meet "
                "regulatory requirements; board of directors sets strategy."
            ),
            must_haves_met=["Clear purpose beyond profit"],
            flags=[],
        ),
        "Northwind Consulting Inc.",
    )
    assert result is not None
    assert result["type"] == "other"
    assert result["sse_rating"] == "no"
    assert any("private_company_gate" in f for f in result["flags"])


@pytest.mark.parametrize("org_type", ["cooperative", "union"])
def test_private_company_gate_skips_coop_union_with_corp_suffix(org_type):
    """Corp suffix alone must not demote cooperative/union without registration."""
    result = _parse_response(
        _assessment_json(
            canonical_name="Workers Collective Inc.",
            slug="workers-collective-inc",
            type=org_type,
            sse_rating="weak_yes",
            sse_reasoning_en=(
                "A member-run organization providing mutual support; "
                "no charity registration cited."
            ),
            must_haves_met=["Clear purpose beyond profit"],
            flags=[],
        ),
        "Workers Collective Inc.",
    )
    assert result is not None
    assert result["type"] == org_type
    assert result["sse_rating"] == "weak_yes"
    assert not any("private_company_gate" in f for f in result["flags"])


def test_private_company_gate_demotes_explicit_for_profit_evidence():
    result = _parse_response(
        _assessment_json(
            canonical_name="Green Consult Co",
            slug="green-consult-co",
            type="nonprofit",
            sse_rating="weak_yes",
            sse_reasoning_en=(
                "A privately owned environmental consultancy with CSR language."
            ),
        ),
        "Green Consult Co",
    )
    assert result is not None
    assert result["type"] == "other"
    assert result["sse_rating"] == "no"
    assert any("private_company_gate" in f for f in result["flags"])


def test_private_company_gate_keeps_inc_with_charity_registration_evidence():
    result = _parse_response(
        _assessment_json(
            canonical_name="Community Care Inc.",
            slug="community-care-inc",
            type="nonprofit",
            sse_rating="strong_yes",
            sse_reasoning_en=(
                "Registered charity with a clear public-benefit mission and "
                "non-distribution constraints."
            ),
            must_haves_met=[
                "Clear purpose beyond profit",
                "Impact described intentionally",
                "Organization's work contributes to social/community/environmental good",
            ],
        ),
        "Community Care Inc.",
    )
    assert result is not None
    assert result["type"] == "nonprofit"
    assert result["sse_rating"] == "strong_yes"
    assert not any("private_company_gate" in f for f in result["flags"])


def test_org_assessment_prompt_rejects_commercial_inc_music_schools():
    from utils.organization_assessment import _build_assessment_prompt

    prompt = _build_assessment_prompt(
        "Family Music Programs Inc.",
        "Toronto",
        "ON",
        "",
        "",
    )
    assert "commercial Inc./Ltd. businesses are not nonprofits" in prompt
    # Check for website rules about accepting URLs
    assert "ACCEPT any URL that identifies this specific organization" in prompt
    assert "Social media and marketplace pages are LEGITIMATE web presences" in prompt


def test_org_assessment_prompt_place_name_not_government():
    from utils.organization_assessment import _build_assessment_prompt

    prompt = _build_assessment_prompt(
        "Riverside Wind Orchestra",
        "Riverside",
        "ON",
        "",
        "",
    )
    assert "geographic branding only" in prompt
    assert "Community orchestras" in prompt
    assert "arts marketing, audience development" in prompt.lower()


def test_place_name_guard_remaps_community_orchestra_from_government():
    result = _parse_response(
        _assessment_json(
            canonical_name="Riverside Wind Orchestra",
            slug="riverside-wind-orchestra",
            type="government",
            sector_id="community-civic-infrastructure",
            sse_rating="no",
            sse_reasoning_en=(
                "Named after the town of Riverside; assumed to be a public body "
                "from the place name alone."
            ),
        ),
        "Riverside Wind Orchestra",
    )
    assert result is not None
    assert result["type"] == "nonprofit"
    assert result["sse_rating"] == "weak_yes"
    assert result["sector_id"] == "arts-culture-information"
    assert any("place_name_guard" in f for f in result["flags"])


def test_place_name_guard_keeps_true_municipal_agency():
    result = _parse_response(
        _assessment_json(
            canonical_name="Riverside Community Orchestra",
            slug="riverside-community-orchestra",
            type="government",
            sse_rating="no",
            sse_reasoning_en=(
                "A municipal department of the City of Riverside Parks Division "
                "with a governing body appointed by council."
            ),
        ),
        "Riverside Community Orchestra",
    )
    assert result is not None
    assert result["type"] == "government"
    assert result["sse_rating"] == "no"
    assert not any("place_name_guard" in f for f in result["flags"])


def test_assess_handles_null_geographic_scope():
    """Assessor should handle None/null geographic_scope without raising AttributeError."""
    from unittest.mock import MagicMock, patch

    from utils.organization_assessment import OrganizationAssessor

    mock_provider = MagicMock()
    mock_provider.complete.return_value = json.dumps({
        "canonical_name": "Net Zero Atlantic",
        "slug": "net-zero-atlantic",
        "type": "nonprofit",
        "sector_id": "energy-utilities",
        "values": ["sustainability"],
        "values_raw": "Sustainability",
        "sse_rating": "weak_yes",
        "sse_confidence": 0.8,
        "sse_reasoning_en": "Environmental nonprofit working on net-zero transition.",
        "sse_reasoning_fr": None,
        "must_haves_met": ["Explicit primary social, environmental, or community purpose"],
        "nice_to_haves_met": [],
        "flags": [
            "description via=extracted",
            "mission via=extracted",
            "values via=extracted",
        ],
        "public_language": "en",
        "geographic_scope": None,
        "headquarters_municipality": "Halifax",
        "headquarters_province": "NS",
        "website": "https://netzeroatlantic.ca",
        "description_en": "Net Zero Atlantic is a research association in Halifax, NS.",
        "description_fr": None,
        "mission_statement_en": "Advancing transition to net zero.",
        "mission_statement_fr": None,
        "values_en": ["sustainability"],
        "values_fr": [],
    })

    with patch("utils.organization_assessment.get_sse_provider", return_value=mock_provider):
        assessor = OrganizationAssessor()
        result = assessor.assess(
            raw_name="Net Zero Atlantic",
            municipality="Halifax",
            province="NS",
        )
    assert result is not None
    assert result["canonical_name"] == "Net Zero Atlantic"
    assert result["geographic_scope"] is None


def test_build_search_query_with_known_website_and_acronym():
    from utils.organization_assessment import _build_search_query

    # With known website: includes website
    q1 = _build_search_query("PARO", "Toronto", "ON", known_website="https://paro.ca")
    assert '"PARO"' in q1
    assert "Toronto, ON, Canada" in q1
    assert "https://paro.ca" in q1

    # Short acronym without known website: extracts distinctive keywords from context
    q2 = _build_search_query(
        "PARO",
        "Toronto",
        "ON",
        known_website=None,
        context_hint="PARO is a women's enterprise and community economic development organization.",
    )
    assert '"PARO"' in q2
    assert "Toronto, ON, Canada" in q2
    assert "women" in q2 or "enterprise" in q2 or "development" in q2


def test_assess_passes_prefer_hosts_for_known_website():
    from unittest.mock import MagicMock, patch

    from utils.organization_assessment import OrganizationAssessor

    mock_provider = MagicMock()
    mock_provider.complete.return_value = json.dumps({
        "canonical_name": "PARO Centre for Women's Enterprise",
        "slug": "paro-centre-for-womens-enterprise",
        "type": "nonprofit",
        "sector_id": "community-civic-infrastructure",
        "values": ["Community"],
        "values_raw": "Community",
        "sse_rating": "strong_yes",
        "sse_confidence": 0.95,
        "sse_reasoning_en": "Non-profit women's enterprise CED.",
        "sse_reasoning_fr": None,
        "must_haves_met": ["Explicit primary social, environmental, or community purpose"],
        "nice_to_haves_met": [],
        "flags": [
            "description via=extracted",
            "mission via=extracted",
            "values via=extracted",
        ],
        "public_language": "en",
        "geographic_scope": "provincial",
        "website": "https://paro.ca",
        "description_en": "PARO is a specialized women's enterprise...",
        "description_fr": None,
        "mission_statement_en": "Empower women entrepreneurs.",
        "mission_statement_fr": None,
        "values_en": ["Community"],
        "values_fr": [],
    })

    with patch("utils.organization_assessment.get_sse_provider", return_value=mock_provider):
        assessor = OrganizationAssessor()
        assessor.assess(
            raw_name="PARO",
            municipality="Toronto",
            province="ON",
            known_website="https://paro.ca",
            existing_description="PARO is a women's enterprise organization in Ontario.",
        )

    call_kwargs = mock_provider.complete.call_args.kwargs
    assert call_kwargs.get("prefer_hosts") == ["paro.ca"]
    assert "https://paro.ca" in call_kwargs.get("search_query", "")


# ---------------------------------------------------------------------------
# assess_with_outcome: skip reasons drive the admin review queue
# ---------------------------------------------------------------------------


def _valid_assessment_payload(**overrides):
    payload = {
        "canonical_name": "Riverside Housing Co-op",
        "slug": "riverside-housing-co-op",
        "type": "cooperative",
        "sector_id": "housing",
        "values": ["Community"],
        "values_raw": "Community",
        "sse_rating": "strong_yes",
        "sse_confidence": 0.9,
        "sse_reasoning_en": "Member-owned housing cooperative.",
        "sse_reasoning_fr": None,
        "must_haves_met": ["Explicit primary social, environmental, or community purpose"],
        "nice_to_haves_met": [],
        "flags": [
            "description via=extracted",
            "mission via=extracted",
            "values via=extracted",
        ],
        "public_language": "en",
        "geographic_scope": "local",
        "website": None,
        "description_en": "Riverside Housing Co-op provides member-owned housing.",
        "description_fr": None,
        "mission_statement_en": "Affordable member-owned housing.",
        "mission_statement_fr": None,
        "values_en": ["Community"],
        "values_fr": [],
    }
    payload.update(overrides)
    return payload


def _assessor_with_provider(mock_provider):
    from unittest.mock import patch

    from utils.organization_assessment import OrganizationAssessor

    with patch("utils.organization_assessment.get_sse_provider", return_value=mock_provider):
        return OrganizationAssessor()


def test_assess_with_outcome_flags_private_residence_without_calling_llm():
    from unittest.mock import MagicMock

    from utils.organization_assessment import SKIP_REASON_PRIVATE_RESIDENCE

    mock_provider = MagicMock()
    assessor = _assessor_with_provider(mock_provider)

    outcome = assessor.assess_with_outcome(raw_name="Private Residence")

    assert outcome.result is None
    assert outcome.skip_reason == SKIP_REASON_PRIVATE_RESIDENCE
    mock_provider.complete.assert_not_called()


def test_assess_with_outcome_maps_provider_503_to_llm_error():
    from unittest.mock import MagicMock

    from llm.base import LLMProviderError
    from utils.organization_assessment import SKIP_REASON_LLM_ERROR

    mock_provider = MagicMock()
    mock_provider.complete.side_effect = LLMProviderError(
        "Gemini completion error: 503 UNAVAILABLE."
    )
    assessor = _assessor_with_provider(mock_provider)

    outcome = assessor.assess_with_outcome(raw_name="Riverside Housing Co-op")

    assert outcome.result is None
    assert outcome.skip_reason == SKIP_REASON_LLM_ERROR


def test_assess_with_outcome_reports_empty_response_after_retry():
    from unittest.mock import MagicMock

    from utils.organization_assessment import SKIP_REASON_EMPTY_RESPONSE

    mock_provider = MagicMock()
    mock_provider.complete.return_value = "   "
    assessor = _assessor_with_provider(mock_provider)

    outcome = assessor.assess_with_outcome(raw_name="Riverside Housing Co-op")

    assert outcome.result is None
    assert outcome.skip_reason == SKIP_REASON_EMPTY_RESPONSE


def test_assess_with_outcome_reports_parse_failed_on_garbage_json():
    from unittest.mock import MagicMock

    from utils.organization_assessment import SKIP_REASON_PARSE_FAILED

    mock_provider = MagicMock()
    mock_provider.complete.return_value = "not json at all"
    assessor = _assessor_with_provider(mock_provider)

    outcome = assessor.assess_with_outcome(raw_name="Riverside Housing Co-op")

    assert outcome.result is None
    assert outcome.skip_reason == SKIP_REASON_PARSE_FAILED


def test_assess_with_outcome_reports_location_mismatch():
    """The St. Catharines case: LLM answered, but for the wrong municipality."""
    from unittest.mock import MagicMock

    from utils.organization_assessment import SKIP_REASON_LOCATION_MISMATCH

    mock_provider = MagicMock()
    mock_provider.complete.return_value = json.dumps(
        _valid_assessment_payload(
            canonical_name="City of St. Catharines",
            slug="city-of-st-catharines",
            type="government",
            website="https://stcatharines.ca",
            description_en="The municipal government of St. Catharines, Ontario.",
            mission_statement_en="Serving St. Catharines residents.",
            geographic_scope="local",
        )
    )
    assessor = _assessor_with_provider(mock_provider)

    outcome = assessor.assess_with_outcome(
        raw_name="City of St. Catharines",
        municipality="Sainte-Catherine",
        province="QC",
    )

    assert outcome.result is None
    assert outcome.skip_reason == SKIP_REASON_LOCATION_MISMATCH


def test_assess_with_outcome_returns_no_reason_on_success():
    from unittest.mock import MagicMock

    mock_provider = MagicMock()
    mock_provider.complete.return_value = json.dumps(_valid_assessment_payload())
    assessor = _assessor_with_provider(mock_provider)

    outcome = assessor.assess_with_outcome(
        raw_name="Riverside Housing Co-op",
        municipality="Halifax",
        province="NS",
    )

    assert outcome.skip_reason is None
    assert outcome.result is not None
    assert outcome.result["canonical_name"] == "Riverside Housing Co-op"


def test_assess_wrapper_preserves_result_or_none_contract():
    """Existing callers keep getting a result or None, never an outcome object."""
    from unittest.mock import MagicMock

    from llm.base import LLMProviderError

    ok_provider = MagicMock()
    ok_provider.complete.return_value = json.dumps(_valid_assessment_payload())
    assert _assessor_with_provider(ok_provider).assess(
        raw_name="Riverside Housing Co-op"
    )["canonical_name"] == "Riverside Housing Co-op"

    failing_provider = MagicMock()
    failing_provider.complete.side_effect = LLMProviderError("503 UNAVAILABLE")
    assert _assessor_with_provider(failing_provider).assess(
        raw_name="Riverside Housing Co-op"
    ) is None


def test_values_rules_require_infer_from_tavily_when_no_literal_list():
    """Empty values was the easy out; parked backlog is almost all 'missing values'."""
    prompt = _build_assessment_prompt(
        raw_name="AECOM",
        municipality="Toronto",
        province="ON",
        job_title="Engineer",
    )
    assert "return an empty array" not in prompt
    assert "Still return 3–5 Knowdell labels" in prompt
    assert "Tavily/web evidence" in prompt
    assert "NEVER use SOURCE DESCRIPTION or listing notes for values" in prompt
    assert "you MUST infer values too" in prompt
    assert "Municipal / government" in prompt


def test_description_present_without_values():
    from utils.organization_assessment import (
        _description_present_without_values,
        _should_retry_empty_values,
    )

    assert _description_present_without_values(
        {
            "description_en": "A municipal government in Ontario.",
            "description_fr": "",
            "values": [],
        }
    )
    assert not _description_present_without_values(
        {
            "description_en": "A municipal government in Ontario.",
            "description_fr": "",
            "values": ["Community"],
        }
    )
    assert not _description_present_without_values(
        {"description_en": "", "description_fr": "", "values": []}
    )

    inferred_empty = {
        "description_en": "A municipal government in Ontario.",
        "description_fr": "",
        "values": [],
        "flags": ["description via=inferred", "values via=absent"],
    }
    extracted_empty = {
        "description_en": "Stale listing blurb only.",
        "description_fr": "",
        "values": [],
        "flags": ["description via=extracted", "values via=absent"],
    }
    assert _should_retry_empty_values(inferred_empty)
    assert not _should_retry_empty_values(extracted_empty)


def test_assess_with_outcome_keeps_first_parse_when_values_retry_still_empty():
    """Empty values after retry must not discard a usable first parse as parse_failed."""
    from unittest.mock import MagicMock

    empty_values = json.dumps(
        _valid_assessment_payload(
            values=[],
            values_raw=None,
            flags=[
                "description via=inferred",
                "mission via=absent",
                "values via=absent",
            ],
        )
    )
    mock_provider = MagicMock()
    mock_provider.complete.side_effect = [empty_values, empty_values]
    assessor = _assessor_with_provider(mock_provider)

    outcome = assessor.assess_with_outcome(
        raw_name="Riverside Housing Co-op",
        municipality="Halifax",
        province="NS",
    )

    assert outcome.skip_reason is None
    assert outcome.result is not None
    assert outcome.result["description_en"]
    assert outcome.result["values"] == []
    assert mock_provider.complete.call_count >= 2


def test_assess_with_outcome_skips_values_retry_for_source_description_only():
    """SOURCE DESCRIPTION + empty values must not trigger the research values nudge."""
    from unittest.mock import MagicMock

    source_only = json.dumps(
        _valid_assessment_payload(
            values=[],
            values_raw=None,
            flags=[
                "description via=extracted",
                "mission via=absent",
                "values via=absent",
            ],
        )
    )
    mock_provider = MagicMock()
    mock_provider.complete.return_value = source_only
    assessor = _assessor_with_provider(mock_provider)

    outcome = assessor.assess_with_outcome(
        raw_name="Riverside Housing Co-op",
        municipality="Halifax",
        province="NS",
        existing_description="Stale listing blurb only.",
    )

    assert outcome.skip_reason is None
    assert outcome.result is not None
    assert outcome.result["values"] == []
    assert mock_provider.complete.call_count == 1


def test_assess_with_outcome_uses_values_retry_when_it_fills_values():
    from unittest.mock import MagicMock

    empty_values = json.dumps(
        _valid_assessment_payload(
            values=[],
            values_raw=None,
            flags=[
                "description via=inferred",
                "mission via=absent",
                "values via=absent",
            ],
        )
    )
    with_values = json.dumps(
        _valid_assessment_payload(
            values=["Community", "Help Society", "Stability"],
            values_raw=None,
            flags=[
                "description via=inferred",
                "mission via=absent",
                "values via=inferred",
            ],
        )
    )
    mock_provider = MagicMock()
    mock_provider.complete.side_effect = [empty_values, with_values]
    assessor = _assessor_with_provider(mock_provider)

    outcome = assessor.assess_with_outcome(
        raw_name="Riverside Housing Co-op",
        municipality="Halifax",
        province="NS",
    )

    assert outcome.skip_reason is None
    assert outcome.result is not None
    assert outcome.result["values"] == ["Community", "Help Society", "Stability"]
