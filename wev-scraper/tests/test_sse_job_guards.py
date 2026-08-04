"""Unit tests for job SSE post-guards (compensation + for-profit admissions)."""

from datetime import datetime, timezone

from utils.sse_job_guards import (
    apply_job_sse_guards,
    compensation_is_incomplete,
    salary_is_missing,
)


def _yes_result(rating: str = "strong_yes", **overrides) -> dict:
    base = {
        "rating": rating,
        "confidence": 0.9,
        "reasoning": "Clear nonprofit mission.",
        "must_haves_met": ["Clear purpose beyond profit"],
        "nice_to_haves_met": [],
        "flags": [],
        "classified_at": datetime.now(timezone.utc).isoformat(),
        "reviewed": False,
    }
    base.update(overrides)
    return base


def test_salary_is_missing_placeholders():
    assert salary_is_missing(None)
    assert salary_is_missing("")
    assert salary_is_missing("N/A")
    assert salary_is_missing("Not specified")
    assert salary_is_missing("tbd")
    assert not salary_is_missing("$19/hr")
    assert not salary_is_missing("$56,780 - $62,000")


def test_compensation_incomplete_when_na_and_no_body_pay():
    assert compensation_is_incomplete(
        salary="N/A",
        description="Seasonal full-time field biologist for turtle conservation.",
    )


def test_compensation_complete_when_body_has_pay():
    assert not compensation_is_incomplete(
        salary="N/A",
        description="Pay is $22/hour. Seasonal full-time field role.",
    )


def test_compensation_complete_when_volunteer_disclosed():
    assert not compensation_is_incomplete(
        salary="N/A",
        description="This is a volunteer opportunity supporting wildlife rehab.",
    )


def test_compensation_incomplete_when_competitive_only():
    assert compensation_is_incomplete(
        salary="Competitive",
        description="Join our charity team. Hours flexible.",
    )


def test_guard_forces_no_on_missing_pay_yes():
    result = apply_job_sse_guards(
        _yes_result(),
        salary="N/A",
        description="Field biologist seasonal full-time multi-location.",
    )
    assert result["rating"] == "no"
    assert any("compensation_gate" in f for f in result["flags"])


def test_guard_keeps_yes_when_pay_present():
    result = apply_job_sse_guards(
        _yes_result(),
        salary="$19–$22/hour",
        description="Administrative assistant at a wildlife charity.",
    )
    assert result["rating"] == "strong_yes"
    assert not any("compensation_gate" in f for f in result["flags"])


def test_guard_forces_no_when_model_admits_for_profit():
    result = apply_job_sse_guards(
        _yes_result(
            rating="weak_yes",
            reasoning=(
                "Green Valley Market Garden Inc. is a privately owned family farm "
                "with ecological practices. Mission-flavored but for-profit."
            ),
        ),
        salary="$19/hr",
        description="Organic no-till veg farm worker. Pay $19/hr.",
    )
    assert result["rating"] == "no"
    assert any("governance_gate" in f for f in result["flags"])


def test_guard_forces_no_when_flags_admit_missing_comp():
    result = apply_job_sse_guards(
        _yes_result(
            flags=["Missing compensation disclosure"],
        ),
        salary="$22/hr",  # salary present; model still flagged missing
        description="Charity biologist. Pay $22/hr.",
    )
    assert result["rating"] == "no"
    assert any("compensation_gate" in f for f in result["flags"])


def test_guard_does_not_promote_no():
    result = apply_job_sse_guards(
        _yes_result(rating="no", reasoning="Government employer."),
        salary="N/A",
        description="Municipal arborist.",
    )
    assert result["rating"] == "no"
    assert not any("compensation_gate" in f for f in result["flags"])
