"""Tests for organization assessment response parsing."""

import json
from unittest.mock import MagicMock, patch

from utils.organization_assessment import (
    _attach_org_language,
    _build_search_query,
    _parse_response,
    _parse_website,)
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
def test_french_name_yields_to_research_public_language(mock_classify):
    """Name LLM is lowest priority — research public_language wins (YMCA/SAC bug)."""
    mock_classify.return_value = LanguageClassification("fr", 0.7, "llm_name", ("name_llm=fr",))
    row = _attach_org_language({"name": "Fondation Acme", "website": None}, "bilingual")
    assert row["language"] == "bilingual"
    assert "language:bilingual via=public_language" in row["sse_details"]["flags"]
    assert "language_reason:name_llm=fr" in row["sse_details"]["flags"]


@patch("utils.organization_assessment.classify_org_language")
def test_website_bilingual_beats_name_llm_and_public_language(mock_classify):
    mock_classify.return_value = LanguageClassification(
        "bilingual",
        0.95,
        "web_dual_probe",
        ("probe_en=True", "probe_fr=True"),
    )
    row = _attach_org_language(
        {"name": "YMCA Québec", "website": "https://ymcaquebec.org"},
        "fr",
    )
    assert row["language"] == "bilingual"
    assert "language:bilingual via=web_dual_probe" in row["sse_details"]["flags"]


@patch("utils.organization_assessment.classify_org_language")
def test_french_website_beats_name_llm(mock_classify):
    """French-named org with French-only site → fr via=website, not llm_name."""
    mock_classify.return_value = LanguageClassification(
        "fr",
        0.85,
        "web_text",
        ("web_signal=fr",),
    )
    row = _attach_org_language(
        {"name": "Service d'aide aux conjoints", "website": "https://sac.qc.ca"},
        "en",
    )
    assert row["language"] == "fr"
    assert "language:fr via=web_text" in row["sse_details"]["flags"]


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
def test_force_lang_with_website_enables_fetch(mock_classify):
    mock_classify.return_value = LanguageClassification(
        "fr", 0.85, "web_text", ("web_signal=fr",)
    )
    row = _attach_org_language(
        {"name": "Org FR", "website": "https://exemple.qc.ca"},
        None,
        force_lang=True,
        fetch_web=False,
    )
    mock_classify.assert_called_once()
    assert mock_classify.call_args.kwargs["fetch_web"] is True
    assert row["language"] == "fr"


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
        listing_notes="listing notes",
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
    assert "Organization name ONLY as last-resort weak evidence" in prompt
    assert "never let the name override confirmed page" in prompt
    assert "substantial English AND French" in prompt


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


def test_apply_website_known_guard_prefers_known_url():
    from utils.organization_assessment import _apply_website_known_guard

    result = _parse_response(
        _assessment_json(website="https://wrong-example.org"),
        "Nature Visuals",
    )
    assert result is not None
    guarded = _apply_website_known_guard(result, "https://naturevisuals.org")
    assert guarded["website"] == "https://naturevisuals.org"
    assert any("website_guard" in f for f in (guarded.get("flags") or []) if isinstance(f, str))


@patch("utils.website_verify.verify_website_live", return_value=True)
def test_confirm_result_website_keeps_evidence_host(mock_live):
    from utils.organization_assessment import _confirm_result_website

    result = _parse_response(
        _assessment_json(website="https://naturevisuals.org"),
        "Nature Visuals",
    )
    assert result is not None
    confirmed = _confirm_result_website(
        result,
        evidence_urls=["https://www.naturevisuals.org/about"],
        known_website=None,
    )
    assert confirmed["website"] == "https://naturevisuals.org"
    mock_live.assert_called_once()


@patch("utils.website_verify.verify_website_live", return_value=True)
def test_confirm_result_website_rejects_invented_host(mock_live):
    from utils.organization_assessment import _confirm_result_website

    result = _parse_response(
        _assessment_json(website="https://invented-nature-visuals.org"),
        "Nature Visuals",
    )
    assert result is not None
    confirmed = _confirm_result_website(
        result,
        evidence_urls=["https://linkedin.com/company/nature-visuals"],
        known_website=None,
    )
    assert confirmed["website"] is None
    assert "website_unconfirmed" in confirmed["flags"]
    mock_live.assert_not_called()


@patch("utils.website_verify.verify_website_live", return_value=True)
def test_confirm_result_website_clears_copy_on_foreign_gov(mock_live):
    from utils.organization_assessment import _confirm_result_website

    result = _parse_response(
        _assessment_json(
            website="https://gbi.georgia.gov",
            description_en="Georgia Bureau of Investigation public safety agency",
            mission_statement_en="Protect the citizens of Georgia",
            values_raw="Integrity Service",
        ),
        "Gbi",
    )
    assert result is not None
    confirmed = _confirm_result_website(
        result,
        evidence_urls=["https://gbi.georgia.gov/"],
        known_website=None,
        municipality="Montreal",
        province="QC",
    )
    assert confirmed["website"] is None
    assert "website_geo_conflict" in confirmed["flags"]
    assert confirmed["description_en"] is None
    assert confirmed["mission_statement_en"] is None
    assert confirmed["values_raw"] is None
    mock_live.assert_not_called()


@patch("utils.website_verify.verify_website_live", return_value=True)
def test_confirm_result_website_clears_copy_on_geo_conflict(mock_live):
    from utils.organization_assessment import _confirm_result_website

    result = _parse_response(
        _assessment_json(
            website="https://foxholefarmohio.com",
            description_en="Family farm in Brookville Ohio",
        ),
        "Foxhole Farm",
    )
    assert result is not None
    confirmed = _confirm_result_website(
        result,
        evidence_urls=["https://foxholefarmohio.com/"],
        known_website=None,
        municipality="Rockwood",
        province="ON",
        site_title="Foxhole Farm Ohio",
        site_text="Welcome to our Brookville, Ohio farm since 1890",
    )
    assert confirmed["website"] is None
    assert "website_geo_conflict" in confirmed["flags"]
    assert confirmed["description_en"] is None


def test_demote_extracted_without_confirmed_website():
    from utils.organization_assessment import (
        _demote_extracted_without_confirmed_website,
    )

    result = _parse_response(
        _assessment_json(
            website=None,
            flags=[
                "description via=extracted",
                "mission via=extracted",
                "values via=extracted",
            ],
        ),
        "Nature Visuals",
    )
    assert result is not None
    demoted = _demote_extracted_without_confirmed_website(result)
    assert demoted["website"] is None
    assert "description via=inferred" in demoted["flags"]
    assert "mission via=inferred" in demoted["flags"]
    assert "values via=inferred" in demoted["flags"]
    assert "description via=extracted" not in demoted["flags"]


def test_org_assessment_prompt_forbids_invented_websites():
    from utils.organization_assessment import (
        _build_assessment_prompt,
    )

    prompt = _build_assessment_prompt(
        "Acme Co-op",
        "Toronto",
        "ON",
        job_title="Coordinator",
        description="listing notes",
    )
    assert "NEVER invent" in prompt or "Never invent" in prompt
    assert "SUPPORTING" in prompt or "supporting" in prompt
    assert "LinkedIn" in prompt or "Glassdoor" in prompt
    assert "LOCATION DISAMBIGUATION" in prompt or "ENTITY / LOCATION" in prompt
    assert "same-name" in prompt.lower() or "other countries" in prompt.lower()
    assert "FLAGS RULES" in prompt
    assert "via=extracted" in prompt
    assert "CONFIRMED website" in prompt or "confirmed org website" in prompt.lower()


def test_build_search_query_targets_official_website():
    from utils.sse_prompts import SSE_SEARCH_KEYWORDS

    q = _build_search_query("Mindrift", "Toronto", "ON")
    assert '"Mindrift" Toronto Ontario Canada official website' in q
    assert SSE_SEARCH_KEYWORDS in q


def test_build_search_query_includes_known_website():
    from utils.sse_prompts import SSE_SEARCH_KEYWORDS

    q = _build_search_query(
        "Gates Foundation",
        known_website="https://www.gatesfoundation.org/",
    )
    assert '"Gates Foundation" official website https://www.gatesfoundation.org/' in q
    assert SSE_SEARCH_KEYWORDS in q


def test_build_search_query_foxhole_includes_location():
    q = _build_search_query("Foxhole Farm", "Rockwood", "ON")
    assert "Rockwood" in q
    assert "Ontario" in q
    assert "Canada" in q
    assert '"Foxhole Farm"' in q


def test_build_search_query_includes_job_title():
    q = _build_search_query(
        "9076-5215 QUÉBEC Inc.",
        "Magog",
        "QC",
        job_title="Rembourreur",
    )
    assert '"9076-5215 QUÉBEC Inc."' in q
    assert "Rembourreur" in q
    assert "Magog" in q
    assert "Quebec" in q
    assert "registre" in q
    assert "NEQ" in q
    assert "official website" not in q


def test_prefer_hosts_boosts_listing_and_qc_registre():
    from utils.organization_assessment import _prefer_hosts_for_assess

    hosts = _prefer_hosts_for_assess(
        listing_url="https://www.macommunaute.ca/emploi/rembourreur",
        raw_name="9076-5215 QUÉBEC Inc.",
    )
    assert hosts is not None
    assert "macommunaute.ca" in hosts
    assert "registreentreprises.gouv.qc.ca" in hosts
    assert hosts.index("macommunaute.ca") < hosts.index("registreentreprises.gouv.qc.ca")


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
        _assessment_json(
            type="nonprofit",
            sse_rating="strong_yes",
        ),
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


def test_governance_gate_forces_yes_when_type_is_null():
    """Null type with Yes is forbidden — demote to no."""
    result = _parse_response(
        _assessment_json(
            type=None,
            sse_rating="strong_yes",
            sse_reasoning_en="Clear community ownership and mission.",
        ),
        "Mystery Mutual",
    )
    assert result is not None
    assert result["sse_rating"] == "no"
    assert any("governance_gate" in f for f in result["flags"])
    assert any("null type" in f for f in result["flags"])


def test_governance_gate_demotes_yes_when_reasoning_admits_unconfirmed_status():
    result = _parse_response(
        _assessment_json(
            type="nonprofit",
            sse_rating="weak_yes",
            sse_reasoning_en=(
                "Mission shows public benefit, but explicit nonprofit status "
                "is not confirmed from public materials."
            ),
        ),
        "Ambiguous School",
    )
    assert result is not None
    assert result["sse_rating"] == "no"
    assert any("unconfirmed" in f for f in result["flags"])


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











def test_build_search_query_stays_under_tavily_limit():
    q = _build_search_query(
        "Association pour la promotion de la santé des personnes utilisatrices de drogues",
        "Montreal",
        "QC",
        known_website="https://aqpsud.org",
        job_title="Coordonnateur.trice aux communications et au développement",
    )
    assert len(q) <= 400



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


def test_governance_gate_forces_political_party_other_yes_to_no():
    """Political parties stored as other cannot be SSE yes."""
    result = _parse_response(
        _assessment_json(
            canonical_name="Green Party Example",
            slug="green-party-example",
            type="other",
            sse_rating="weak_yes",
            sse_reasoning_en="Electoral organization with environmental platform.",
        ),
        "Green Party Example",
    )
    assert result is not None
    assert result["type"] == "other"
    assert result["sse_rating"] == "no"
    assert any("governance_gate" in f for f in result["flags"])


@patch("utils.organization_assessment.get_sse_provider")
def test_assess_hard_fails_when_tavily_unavailable(mock_get_sse_provider):
    """Org assessor must raise when Tavily is broken — never soft-None with empty evidence."""
    import pytest
    from llm.tavily_grounding import TavilyUnavailableError
    from utils.organization_assessment import OrganizationAssessor

    mock_provider = MagicMock()
    mock_get_sse_provider.return_value = mock_provider
    assessor = OrganizationAssessor()

    with patch(
        "llm.tavily_grounding.require_tavily",
        side_effect=TavilyUnavailableError("No module named 'tavily'"),
    ):
        with pytest.raises(TavilyUnavailableError, match="tavily"):
            assessor.assess(raw_name="Park People", municipality="Toronto", province="ON")

    mock_provider.complete.assert_not_called()


@patch("utils.organization_assessment.get_sse_provider")
def test_assess_hard_fails_when_is_tavily_available_false(mock_get_sse_provider):
    """is_tavily_available False → require_tavily raises → assess aborts."""
    import pytest
    from llm.tavily_grounding import TavilyUnavailableError
    from utils.organization_assessment import OrganizationAssessor

    mock_provider = MagicMock()
    mock_get_sse_provider.return_value = mock_provider
    assessor = OrganizationAssessor()

    with patch("llm.tavily_grounding.is_tavily_available", return_value=False), \
         patch("llm.tavily_grounding.tavily_api_key", return_value=""), \
         patch("llm.tavily_grounding._tavily_import_error", return_value=None):
        with pytest.raises(TavilyUnavailableError, match="TAVILY_API_KEY"):
            assessor.assess(raw_name="Park People")

    mock_provider.complete.assert_not_called()
