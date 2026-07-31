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
