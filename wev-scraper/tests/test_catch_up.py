"""Tests for the organization catch-up parking behaviour.

The point of parking: before assessment_skip_reason existed, an attempt that
failed wrote nothing, so the same incomplete orgs were re-assessed on every
scrape and burned LLM credits forever.
"""

from unittest.mock import MagicMock, patch

import pytest

from utils.catch_up import (
    SKIP_REASON_EXCEPTION,
    SKIP_REASON_NO_NEW_FIELDS,
    SKIP_REASON_PARTIAL_FILL,
    find_missing_org_fields,
    find_unprocessed_organizations,
    org_batch_limit,
    process_unprocessed_organizations,
    resolve_org_skip_reason,
)
from utils.organization_assessment import (
    SKIP_REASON_LOCATION_MISMATCH,
    AssessmentOutcome,
)


def _complete_org(**overrides):
    org = {
        "id": 1,
        "name": "Riverside Housing Co-op",
        "sector_id": "housing",
        "type": "cooperative",
        "description_en": "Member-owned housing.",
        "description_fr": "Logement détenu par les membres.",
        "language": "en",
        "values_list": ["Community"],
        "assessment_skip_reason": None,
    }
    org.update(overrides)
    return org


# ---------------------------------------------------------------------------
# Completeness predicate
# ---------------------------------------------------------------------------


def test_complete_org_has_no_missing_fields():
    assert find_missing_org_fields(_complete_org()) == []


@pytest.mark.parametrize(
    "overrides,expected",
    [
        ({"sector_id": None}, "sector_id"),
        ({"type": None}, "type"),
        ({"description_en": None, "description": None}, "description_en"),
        ({"description_fr": "   "}, "description_fr"),
        ({"language": "es"}, "language"),
        ({"language": None}, "language"),
        ({"values_list": []}, "values_list"),
    ],
)
def test_missing_field_is_reported(overrides, expected):
    assert expected in find_missing_org_fields(_complete_org(**overrides))


def test_blank_description_en_falls_back_to_legacy_description():
    org = _complete_org(description_en="", description="Legacy blurb.")
    assert "description_en" not in find_missing_org_fields(org)


# ---------------------------------------------------------------------------
# Eligibility: parked orgs cost nothing
# ---------------------------------------------------------------------------


def _patch_rows(rows):
    return patch("utils.catch_up.fetch_all_rows", return_value=rows)


def test_parked_orgs_are_excluded_from_the_queue():
    rows = [
        _complete_org(id=1, sector_id=None, assessment_skip_reason=None),
        _complete_org(id=2, sector_id=None, assessment_skip_reason="location_mismatch"),
        _complete_org(id=3, sector_id=None, assessment_skip_reason="ignored"),
        _complete_org(id=4, sector_id=None, assessment_skip_reason="incomplete_backlog"),
    ]
    with _patch_rows(rows):
        eligible = find_unprocessed_organizations()

    assert [org["id"] for org, _ in eligible] == [1]


def test_include_parked_returns_every_incomplete_org():
    rows = [
        _complete_org(id=1, sector_id=None, assessment_skip_reason=None),
        _complete_org(id=2, sector_id=None, assessment_skip_reason="llm_error"),
    ]
    with _patch_rows(rows):
        eligible = find_unprocessed_organizations(include_parked=True)

    assert [org["id"] for org, _ in eligible] == [1, 2]


def test_complete_orgs_are_never_queued_even_when_unparked():
    with _patch_rows([_complete_org(id=1, assessment_skip_reason=None)]):
        assert find_unprocessed_organizations() == []


# ---------------------------------------------------------------------------
# Batch cap
# ---------------------------------------------------------------------------


def test_org_batch_limit_defaults_to_20(monkeypatch):
    monkeypatch.delenv("CATCH_UP_ORG_LIMIT", raising=False)
    assert org_batch_limit() == 20


def test_org_batch_limit_reads_env(monkeypatch):
    monkeypatch.setenv("CATCH_UP_ORG_LIMIT", "5")
    assert org_batch_limit() == 5


def test_org_batch_limit_zero_means_unlimited(monkeypatch):
    monkeypatch.setenv("CATCH_UP_ORG_LIMIT", "0")
    assert org_batch_limit() == 0


def test_org_batch_limit_falls_back_on_garbage(monkeypatch):
    monkeypatch.setenv("CATCH_UP_ORG_LIMIT", "not-a-number")
    assert org_batch_limit() == 20


def test_catch_up_caps_the_batch(monkeypatch):
    monkeypatch.setenv("CATCH_UP_ORG_LIMIT", "2")
    rows = [_complete_org(id=i, sector_id=None) for i in range(1, 6)]

    with _patch_rows(rows), patch(
        "utils.catch_up.process_unprocessed_organizations", return_value=(2, 0, 0)
    ) as mock_process:
        from utils.catch_up import catch_up_unprocessed

        report = catch_up_unprocessed(skip_jobs=True)

    processed_batch = mock_process.call_args.args[0]
    assert len(processed_batch) == 2
    assert [org["id"] for org, _ in processed_batch] == [1, 2]
    assert report["orgs_total"] == 2


# ---------------------------------------------------------------------------
# Skip-reason resolution
# ---------------------------------------------------------------------------


def test_failed_assessment_keeps_the_assessor_reason():
    outcome = AssessmentOutcome(None, SKIP_REASON_LOCATION_MISMATCH)
    org = _complete_org(sector_id=None)
    assert resolve_org_skip_reason(org, outcome, {}) == SKIP_REASON_LOCATION_MISMATCH


def test_missing_reason_on_failure_falls_back_to_exception():
    assert (
        resolve_org_skip_reason(_complete_org(), AssessmentOutcome(None, None), {})
        == SKIP_REASON_EXCEPTION
    )


def test_result_with_no_usable_fields_parks_as_no_new_fields():
    outcome = AssessmentOutcome({"canonical_name": "X"}, None)
    org = _complete_org(sector_id=None)
    assert resolve_org_skip_reason(org, outcome, {}) == SKIP_REASON_NO_NEW_FIELDS


def test_partially_filled_org_parks_as_partial_fill():
    outcome = AssessmentOutcome({"canonical_name": "X"}, None)
    org = _complete_org(sector_id=None, type=None)
    assert resolve_org_skip_reason(org, outcome, {"type": "nonprofit"}) == SKIP_REASON_PARTIAL_FILL


def test_completed_org_clears_the_reason():
    outcome = AssessmentOutcome({"canonical_name": "X"}, None)
    org = _complete_org(sector_id=None)
    assert resolve_org_skip_reason(org, outcome, {"sector_id": "housing"}) is None


def test_resolution_does_not_depend_on_caller_merging_first():
    """The helper merges filtered over org itself, so call order cannot skew it."""
    outcome = AssessmentOutcome({"canonical_name": "X"}, None)
    org = _complete_org(sector_id=None)
    filtered = {"sector_id": "housing"}

    before = resolve_org_skip_reason(org, outcome, filtered)
    org.update(filtered)
    after = resolve_org_skip_reason(org, outcome, filtered)

    assert before is after is None


# ---------------------------------------------------------------------------
# Writes: every attempt records its outcome
# ---------------------------------------------------------------------------


def _run_processing(orgs, outcomes, db_fields=None):
    """Run the org loop against a mocked assessor and supabase.

    Returns (result_tuple, [update payloads in call order]).
    """
    payloads = []

    table = MagicMock()
    table.update.side_effect = lambda payload: (payloads.append(payload), table)[1]
    table.eq.return_value = table
    table.execute.return_value = MagicMock(data=[{}])

    assessor = MagicMock()
    assessor.assess_with_outcome.side_effect = outcomes

    unprocessed = [(org, find_missing_org_fields(org)) for org in orgs]

    with patch("utils.catch_up.supabase") as mock_sb, patch(
        "utils.organization_assessment.OrganizationAssessor", return_value=assessor
    ), patch("llm.tavily_grounding.is_tavily_available", return_value=True), patch(
        "utils.organization_assessment._result_to_db_fields",
        side_effect=lambda result: db_fields if db_fields is not None else {},
    ), patch.dict(
        "os.environ", {"ORG_ASSESS_DELAY_SECONDS": "0"}
    ):
        mock_sb.table.return_value = table
        result = process_unprocessed_organizations(unprocessed)

    return result, payloads


def test_failed_assessment_writes_the_reason_and_no_fields():
    org = _complete_org(id=7, sector_id=None)
    (success, errors, parked), payloads = _run_processing(
        [org], [AssessmentOutcome(None, SKIP_REASON_LOCATION_MISMATCH)]
    )

    assert payloads == [{"assessment_skip_reason": SKIP_REASON_LOCATION_MISMATCH}]
    assert (success, errors, parked) == (0, 1, 1)


def test_successful_completion_clears_the_reason_in_the_same_write():
    org = _complete_org(id=8, sector_id=None)
    (success, errors, parked), payloads = _run_processing(
        [org],
        [AssessmentOutcome({"canonical_name": "X"}, None)],
        db_fields={"sector_id": "housing"},
    )

    assert payloads == [{"sector_id": "housing", "assessment_skip_reason": None}]
    assert (success, errors, parked) == (1, 0, 0)


def test_assessment_with_nothing_new_parks_as_no_new_fields():
    org = _complete_org(id=9, sector_id=None)
    (success, errors, parked), payloads = _run_processing(
        [org], [AssessmentOutcome({"canonical_name": "X"}, None)], db_fields={}
    )

    assert payloads == [{"assessment_skip_reason": SKIP_REASON_NO_NEW_FIELDS}]
    # Assessment succeeded, so this is a park but not an error.
    assert (success, errors, parked) == (0, 0, 1)


def test_partial_fill_writes_fields_and_parks():
    org = _complete_org(id=10, sector_id=None, type=None)
    (success, errors, parked), payloads = _run_processing(
        [org],
        [AssessmentOutcome({"canonical_name": "X"}, None)],
        db_fields={"type": "nonprofit"},
    )

    assert payloads == [
        {"type": "nonprofit", "assessment_skip_reason": SKIP_REASON_PARTIAL_FILL}
    ]
    assert (success, errors, parked) == (0, 0, 1)


def test_unexpected_error_parks_and_keeps_going():
    orgs = [_complete_org(id=11, sector_id=None), _complete_org(id=12, sector_id=None)]
    outcomes = [RuntimeError("boom"), AssessmentOutcome(None, SKIP_REASON_LOCATION_MISMATCH)]

    (success, errors, parked), payloads = _run_processing(orgs, outcomes)

    # First org parked via the exception path, second still processed.
    assert payloads == [
        {"assessment_skip_reason": SKIP_REASON_EXCEPTION},
        {"assessment_skip_reason": SKIP_REASON_LOCATION_MISMATCH},
    ]
    assert (success, errors, parked) == (0, 2, 2)


# ---------------------------------------------------------------------------
# Every backlog script must record its outcome
# ---------------------------------------------------------------------------

# Manually-run scripts that select incomplete orgs and fill assessed fields.
# Each must write assessment_skip_reason, or a success leaves a stale reason and
# the org is stranded in the admin review queue forever.
BACKLOG_SCRIPTS = [
    "backfill_orgs",
    "reprocess_incomplete_orgs",
    "retry_failed_orgs",
    "reprocess_by_model",
]


@pytest.mark.parametrize("module_name", BACKLOG_SCRIPTS)
def test_backlog_script_uses_the_shared_write_path(module_name):
    import importlib
    import inspect

    module = importlib.import_module(module_name)
    source = inspect.getsource(module)

    assert hasattr(module, "resolve_org_skip_reason"), (
        f"{module_name} must import resolve_org_skip_reason so its write path "
        "matches catch_up"
    )
    assert "assess_with_outcome(" in source, (
        f"{module_name} must call assess_with_outcome() to learn why an "
        "assessment failed"
    )
    assert "assessment_skip_reason" in source, (
        f"{module_name} must persist assessment_skip_reason"
    )
    assert "assessor.assess(" not in source, (
        f"{module_name} still calls the bare assess() wrapper, which discards "
        "the skip reason"
    )


def test_park_failure_does_not_abort_the_run():
    """A DB error while parking must not take down the remaining orgs."""
    from utils.catch_up import _park_org

    table = MagicMock()
    table.update.return_value = table
    table.eq.return_value = table
    table.execute.side_effect = Exception("connection reset")

    with patch("utils.catch_up.supabase") as mock_sb:
        mock_sb.table.return_value = table
        _park_org(1, SKIP_REASON_EXCEPTION)  # must not raise
