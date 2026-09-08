"""Tests for the organization catch-up parking behaviour.

The point of parking: before assessment_skip_reason existed, an attempt that
failed wrote nothing, so the same incomplete orgs were re-assessed on every
scrape and burned LLM credits forever.
"""

from unittest.mock import MagicMock, call, patch

import pytest

from utils.catch_up import (
    SKIP_REASON_EXCEPTION,
    SKIP_REASON_INCOMPLETE_BACKLOG,
    SKIP_REASON_NO_NEW_FIELDS,
    SKIP_REASON_PARTIAL_FILL,
    filter_assessment_update_fields,
    find_missing_org_fields,
    find_unprocessed_organizations,
    org_batch_limit,
    persist_org_assessment_outcome,
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


def test_filter_assessment_update_fields_uses_field_aware_missing_predicate():
    org = _complete_org(language=None, values_list=[])
    outcome = AssessmentOutcome({"canonical_name": "X"}, None)
    db_fields = {
        "language": "en",
        "values_list": ["Community"],
        "description_en": "Already had one.",
    }

    with patch(
        "utils.organization_assessment._result_to_db_fields",
        return_value=db_fields,
    ), patch(
        "utils.organization_assessment._attach_org_language",
        side_effect=lambda row, *a, **k: row,
    ):
        filtered = filter_assessment_update_fields(org, outcome)

    assert filtered == {"language": "en", "values_list": ["Community"]}


def test_filter_assessment_update_fields_attaches_language_from_name():
    org = _complete_org(language=None, values_list=["Community"])
    outcome = AssessmentOutcome(
        {"canonical_name": "Habitations Les Trinitaires", "public_language": None},
        None,
    )
    db_fields = {
        "values_list": ["Community"],
        "sse_details": {"flags": ["values via=inferred"]},
    }

    def _fake_attach(row, llm_public_language=None, force_lang=False, fetch_web=False):
        row["language"] = "fr"
        details = dict(row.get("sse_details") or {})
        flags = list(details.get("flags") or [])
        flags.append("language:fr via=llm_name")
        details["flags"] = flags
        row["sse_details"] = details
        return row

    with patch(
        "utils.organization_assessment._result_to_db_fields",
        return_value=db_fields,
    ), patch(
        "utils.organization_assessment._attach_org_language",
        side_effect=_fake_attach,
    ):
        filtered = filter_assessment_update_fields(org, outcome)

    assert filtered["language"] == "fr"
    assert "language:fr via=llm_name" in filtered["sse_details"]["flags"]


def test_filter_assessment_french_name_beats_english_public_language():
    """Catch-up must not seed language from public_language before classify runs."""
    from utils.organization_language import LanguageClassification

    org = _complete_org(name="Habitations Les Trinitaires", language=None, values_list=["Community"])
    outcome = AssessmentOutcome(
        {
            "canonical_name": "Habitations Les Trinitaires",
            "public_language": "en",
        },
        None,
    )
    db_fields = {
        "language": "en",
        "values_list": ["Community"],
        "sse_details": {"flags": ["values via=inferred"]},
    }

    with patch(
        "utils.organization_assessment._result_to_db_fields",
        return_value=db_fields,
    ), patch(
        "utils.organization_assessment.classify_org_language",
        return_value=LanguageClassification("fr", 0.7, "llm_name", ("name_llm=fr",)),
    ):
        filtered = filter_assessment_update_fields(org, outcome)

    assert filtered["language"] == "fr"
    assert "language:fr via=llm_name" in filtered["sse_details"]["flags"]


def _update_table(*, data=None, payloads=None, error=None):
    """Mock of the supabase table builder used by the org write helpers."""
    table = MagicMock()
    if payloads is None:
        table.update.return_value = table
    else:
        table.update.side_effect = lambda payload: (payloads.append(payload), table)[1]
    table.eq.return_value = table
    table.is_.return_value = table
    if error is not None:
        table.execute.side_effect = error
    else:
        table.execute.return_value = MagicMock(data=data)
    return table


def test_persist_skips_when_another_writer_changed_the_reason():
    org = _complete_org(id=7, sector_id=None)
    outcome = AssessmentOutcome({"canonical_name": "X"}, None)

    table = _update_table(data=[])  # update matched no row

    with patch("utils.catch_up.supabase") as mock_sb, patch(
        "utils.catch_up._reload_org", return_value=dict(org)
    ), patch(
        "utils.organization_assessment._result_to_db_fields",
        return_value={"sector_id": "housing"},
    ):
        mock_sb.table.return_value = table
        write = persist_org_assessment_outcome(org, outcome)

    assert write.applied is False
    # organizations has no updated_at, so the guard is the skip reason we re-read.
    table.is_.assert_called_once_with("assessment_skip_reason", "null")


def test_persist_reports_not_applied_when_the_row_is_gone():
    org = _complete_org(id=7, sector_id=None)
    outcome = AssessmentOutcome({"canonical_name": "X"}, None)

    with patch("utils.catch_up.supabase"), patch(
        "utils.catch_up._reload_org", return_value=None
    ):
        write = persist_org_assessment_outcome(org, outcome)

    assert write.applied is False
    assert write.filtered == {}


def test_persist_resolves_against_the_freshly_read_row():
    """An admin completing the org mid-assessment must clear it, not park it.

    The assessment ran against a row missing sector_id and came back with nothing
    new. Resolving from that stale snapshot parks the org as no_new_fields, sending
    a row the admin just finished straight back into the review queue.
    """
    stale = _complete_org(id=8, sector_id=None)  # what we selected for assessment
    fresh = _complete_org(id=8)  # admin filled it in while we were assessing
    outcome = AssessmentOutcome({"canonical_name": "X"}, None)

    payloads: list[dict] = []
    table = _update_table(data=[{}], payloads=payloads)

    with patch("utils.catch_up.supabase") as mock_sb, patch(
        "utils.catch_up._reload_org", return_value=fresh
    ), patch("utils.organization_assessment._result_to_db_fields", return_value={}):
        mock_sb.table.return_value = table
        write = persist_org_assessment_outcome(stale, outcome)

    assert write.applied is True
    assert write.reason is None, "a row that is already complete must not be parked"
    assert payloads == [{"assessment_skip_reason": None}]


def test_reload_org_returns_none_when_the_read_fails():
    from utils.catch_up import _reload_org

    table = MagicMock()
    table.select.return_value = table
    table.eq.return_value = table
    table.limit.return_value = table
    table.execute.side_effect = Exception("timeout")

    with patch("utils.catch_up.supabase") as mock_sb:
        mock_sb.table.return_value = table
        assert _reload_org(1) is None


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
    table.is_.return_value = table
    table.execute.return_value = MagicMock(data=[{}])

    assessor = MagicMock()
    assessor.assess_with_outcome.side_effect = outcomes

    unprocessed = [(org, find_missing_org_fields(org)) for org in orgs]

    # persist_org_assessment_outcome re-reads the row before writing; hand back the
    # same state so these cases stay focused on the write payloads.
    reload_rows = {o["id"]: dict(o) for o in orgs}

    with patch("utils.catch_up.supabase") as mock_sb, patch(
        "utils.catch_up._reload_org", side_effect=lambda oid: reload_rows.get(oid)
    ), patch(
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
PERSIST_BACKLOG_SCRIPTS = [
    "backfill_orgs",
    "reprocess_incomplete_orgs",
    "retry_failed_orgs",
]
ALL_BACKLOG_SCRIPTS = [*PERSIST_BACKLOG_SCRIPTS, "reprocess_by_model"]


@pytest.mark.parametrize("module_name", PERSIST_BACKLOG_SCRIPTS)
def test_backlog_script_uses_the_shared_write_path(module_name):
    import importlib
    import inspect

    module = importlib.import_module(module_name)
    source = inspect.getsource(module)

    assert "persist_org_assessment_outcome" in source, (
        f"{module_name} must use persist_org_assessment_outcome so its write path "
        "matches catch_up"
    )
    assert "assess_with_outcome(" in source, (
        f"{module_name} must call assess_with_outcome() to learn why an "
        "assessment failed"
    )
    assert "assessor.assess(" not in source, (
        f"{module_name} still calls the bare assess() wrapper, which discards "
        "the skip reason"
    )


@pytest.mark.parametrize("module_name", ALL_BACKLOG_SCRIPTS)
def test_backlog_script_records_assessment_skip_reason(module_name):
    import importlib
    import inspect

    module = importlib.import_module(module_name)
    source = inspect.getsource(module)

    assert (
        "assessment_skip_reason" in source
        or "persist_org_assessment_outcome" in source
    ), (
        f"{module_name} must persist assessment_skip_reason via the shared "
        "write path"
    )
    assert "assess_with_outcome(" in source
    assert "assessor.assess(" not in source


def test_park_failure_does_not_abort_the_run():
    """A DB error while parking must not take down the remaining orgs."""
    from utils.catch_up import _park_org

    table = _update_table(error=Exception("connection reset"))

    with patch("utils.catch_up.supabase") as mock_sb:
        mock_sb.table.return_value = table
        # Must not raise.
        _park_org({"id": 1, "assessment_skip_reason": None}, SKIP_REASON_EXCEPTION)


# ---------------------------------------------------------------------------
# Parking must not overwrite an admin decision
# ---------------------------------------------------------------------------

# An admin can hit Retry (clearing the reason) or Ignore while an assessment is
# in flight. Parking the failure afterwards would silently undo that, so the
# write is conditioned on the reason we read.


def test_park_matches_an_unset_reason_with_is_null():
    from utils.catch_up import _park_org

    table = _update_table(data=[{}])

    with patch("utils.catch_up.supabase") as mock_sb:
        mock_sb.table.return_value = table
        _park_org({"id": 2, "assessment_skip_reason": None}, SKIP_REASON_EXCEPTION)

    # eq would never match a NULL in PostgREST.
    table.is_.assert_called_once_with("assessment_skip_reason", "null")


def test_park_matches_an_existing_reason_with_eq():
    from utils.catch_up import _park_org

    table = _update_table(data=[{}])

    with patch("utils.catch_up.supabase") as mock_sb:
        mock_sb.table.return_value = table
        _park_org(
            {"id": 3, "assessment_skip_reason": SKIP_REASON_INCOMPLETE_BACKLOG},
            SKIP_REASON_EXCEPTION,
        )

    table.is_.assert_not_called()
    assert (
        call("assessment_skip_reason", SKIP_REASON_INCOMPLETE_BACKLOG)
        in table.eq.call_args_list
    )


def test_park_logs_and_preserves_state_when_the_reason_changed():
    """No row matched, so an admin changed the reason while we were assessing."""
    from utils.catch_up import _park_org

    table = _update_table(data=[])
    logged: list[str] = []

    with patch("utils.catch_up.supabase") as mock_sb, patch(
        "utils.catch_up._log", side_effect=lambda m: logged.append(m)
    ):
        mock_sb.table.return_value = table
        _park_org({"id": 4, "assessment_skip_reason": None}, SKIP_REASON_EXCEPTION)

    assert any("changed since read" in m for m in logged), logged
