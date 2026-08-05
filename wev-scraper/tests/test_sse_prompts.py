"""Prompt contract tests for SSE job/org rating rules."""

from utils.sse_prompts import (
    BATCH_RATING_GUIDELINES,
    EVALUATION_CRITERIA,
    ORG_EVALUATION_CRITERIA,
    ORG_RATING_GUIDELINES,
    RATING_GUIDELINES,
    get_sse_classification_prompt,
)


def test_job_rating_rejects_traditional_corp_mission_roles():
    assert "traditional corporations" in RATING_GUIDELINES
    assert "never for conventional for-profits" in RATING_GUIDELINES
    assert "private environmental consultancies" in RATING_GUIDELINES
    assert "GOVERNANCE GATE" in RATING_GUIDELINES


def test_job_auto_no_flags_include_for_profit_csr():
    assert "Conventional for-profit employer" in EVALUATION_CRITERIA
    assert "traditional corporation is NOT Solidarity Economy" in EVALUATION_CRITERIA


def test_batch_rating_rejects_corp_mission_loophole():
    assert "Do NOT use weak_yes for mission-driven roles inside traditional corporations" in BATCH_RATING_GUIDELINES
    assert "GOVERNANCE GATE" in BATCH_RATING_GUIDELINES


def test_classification_prompt_includes_governance_gate():
    prompt = get_sse_classification_prompt(
        org_name="Lyft, Inc.",
        job_title="Social Impact Coordinator",
        location="Toronto",
        salary="$80k",
        job_description="Work on social impact programs at Lyft.",
        posted_date="2026-07-01",
    )
    assert "GOVERNANCE GATE" in prompt
    assert "traditional corporations" in prompt
    assert "Conventional for-profit employer" in prompt


def test_org_charity_not_other_for_lacking_cooperative_governance():
    """Registered charities / community nonprofits stay nonprofit + Yes."""
    assert "charities are never \"other\" for lacking cooperative governance" in ORG_EVALUATION_CRITERIA
    assert "board+ED is SSE-eligible" in ORG_RATING_GUIDELINES or (
        "board + ED" in ORG_RATING_GUIDELINES and "SSE-eligible" in ORG_RATING_GUIDELINES
    )
    assert 'AT LEAST "weak_yes"' in ORG_RATING_GUIDELINES
    assert "Registered charity / community environmental" in ORG_RATING_GUIDELINES


def test_org_mutual_aid_and_flat_structure_prefer_strong_yes():
    assert "mutual-aid, collective care, or solidarity" in ORG_RATING_GUIDELINES
    assert "flat or non-hierarchical structure" in ORG_RATING_GUIDELINES
    assert "Explicit cooperative labels are NOT required for strong_yes" in ORG_RATING_GUIDELINES
    assert "nonprofit without coop labels" in ORG_RATING_GUIDELINES
    assert "do not default to weak_yes" in ORG_RATING_GUIDELINES


def test_org_political_parties_map_to_other_not_government():
    assert "Political parties and electoral organizations" in ORG_EVALUATION_CRITERIA
    assert 'type "other", rating "no"' in ORG_EVALUATION_CRITERIA
    assert "NOT political parties" in ORG_EVALUATION_CRITERIA
    assert "political party" in ORG_EVALUATION_CRITERIA.lower()
    assert 'political party (type "other")' in ORG_RATING_GUIDELINES


def test_job_rating_prefers_weak_yes_for_nonprofit_missing_wage():
    assert "false-no charities solely for opaque" in RATING_GUIDELINES
    assert "wage disclosure alone is NOT an automatic No" in EVALUATION_CRITERIA
    assert "Prefer weak_yes (not no) for clear nonprofit/charity" in BATCH_RATING_GUIDELINES


def test_org_prompt_rejects_commercial_inc_without_charity_registration():
    assert "commercial Inc./Ltd. businesses are not nonprofits" in ORG_EVALUATION_CRITERIA
    assert "Commercial music / arts / education businesses" in ORG_EVALUATION_CRITERIA
    assert "Inc./Ltd./Corp. commercial music" in ORG_RATING_GUIDELINES


def test_org_place_name_not_government_for_community_arts():
    """City-in-name must not force municipal/government typing for arts orgs."""
    assert "place-name / city-in-name is NOT government" in ORG_EVALUATION_CRITERIA
    assert "geographic branding only" in ORG_EVALUATION_CRITERIA
    assert "Community orchestras, choirs, bands, theatres" in ORG_EVALUATION_CRITERIA
    assert "Never type \"government\" from a municipal place-name" in ORG_RATING_GUIDELINES
    assert "community arts / orchestra / choir" in ORG_RATING_GUIDELINES


def test_job_rating_prefers_strong_yes_for_popular_education_nonprofits():
    assert "popular education" in RATING_GUIDELINES
    assert "associative-life training" in RATING_GUIDELINES
    assert "Prefer strong_yes (not weak_yes) when a clear nonprofit/charity" in BATCH_RATING_GUIDELINES
    assert "democratic / associative-life" in BATCH_RATING_GUIDELINES


def test_job_rating_for_profit_commercial_and_engineering_gate():
    assert "engineering firm" in RATING_GUIDELINES
    assert "shipping/trading company" in RATING_GUIDELINES or "shipping line" in EVALUATION_CRITERIA
    assert "COMMERCIAL TITLES" in RATING_GUIDELINES
    assert "Do not swap a nonprofit for a similarly abbreviated for-profit" in RATING_GUIDELINES
    assert "EMPLOYER IDENTITY" in BATCH_RATING_GUIDELINES
