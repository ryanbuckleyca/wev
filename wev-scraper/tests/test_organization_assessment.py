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
    }
    payload.update(overrides)
    return json.dumps(payload)


def test_parse_response_keeps_over_limit_text_until_repair():
    """Parse does not truncate; oversize detection is for the repair pass."""
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


def test_apply_length_repairs_uses_fitting_paraphrase():
    from utils.organization_assessment import (
        _ORG_DESCRIPTION_MAX_CHARS,
        _apply_length_repairs,
        _fields_over_limit,
    )

    long_desc = "y" * 1200
    result = _parse_response(
        _assessment_json(description_en=long_desc),
        "Nature Visuals",
    )
    assert result is not None
    over = _fields_over_limit(result)
    repaired = {"description_en": "A complete short paraphrase that fits."}
    assert len(repaired["description_en"]) <= _ORG_DESCRIPTION_MAX_CHARS

    fixed = _apply_length_repairs(result, over, repaired, "Nature Visuals")
    assert fixed["description_en"] == repaired["description_en"]
    assert not _fields_over_limit(fixed)


def test_apply_length_repairs_drops_field_when_repair_fails():
    from utils.organization_assessment import (
        _apply_length_repairs,
        _fields_over_limit,
    )

    long_desc = "y" * 1200
    result = _parse_response(
        _assessment_json(description_en=long_desc, sse_reasoning_en="ok"),
        "Nature Visuals",
    )
    assert result is not None
    over = _fields_over_limit(result)
    # Empty repair map → drop oversize fields (no truncation).
    fixed = _apply_length_repairs(result, over, {}, "Nature Visuals")
    assert fixed["description_en"] is None
    assert any("length_limit: dropped description_en" in f for f in fixed["flags"])


def test_omit_dropped_length_fields_preserves_existing_on_reassess_update():
    from utils.organization_assessment import (
        _apply_length_repairs,
        _fields_over_limit,
        _omit_dropped_length_fields_from_update,
        _result_to_db_fields,
    )

    long_desc = "y" * 1200
    long_mission = "z" * 900
    result = _parse_response(
        _assessment_json(
            description_en=long_desc,
            mission_statement_en=long_mission,
            sse_reasoning_en="Clear nonprofit mission evidence.",
        ),
        "Nature Visuals",
    )
    assert result is not None
    fixed = _apply_length_repairs(result, _fields_over_limit(result), {}, "Nature Visuals")
    updates = _omit_dropped_length_fields_from_update(_result_to_db_fields(fixed), fixed)
    assert "description_en" not in updates
    assert "description" not in updates
    assert "mission_statement_en" not in updates
    assert "mission_statement" not in updates
    assert updates["sse_rating"] == "strong_yes"
    assert "sse_details" in updates


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
    assert "do not truncate" in prompt
    assert "paraphrase and condense" in prompt
    assert "Do NOT restate must_haves_met" in prompt
    assert "2–4 concise English sentences" in prompt
    assert "MUST fit within" in prompt
    assert "description_en" in prompt and "description_fr" in prompt
    assert "BILINGUAL PUBLIC COPY" in prompt


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


def test_governance_gate_forces_government_yes_to_no():
    """Public-sector orgs are not SSE governance forms (intentional)."""
    result = _parse_response(
        _assessment_json(
            type="government",
            sse_rating="strong_yes",
            sse_reasoning="Public agency serving community needs.",
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
            sse_reasoning="Clear community ownership and mission.",
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
            sse_reasoning="Mentions environment in CSR copy.",
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
                sse_reasoning="Member-owned mutual support structure.",
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
