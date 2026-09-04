"""Tests for job SSE eligibility gated on organization SSE."""

from unittest.mock import MagicMock

from utils.job_sse import (
    ORG_SSE_GATE_FLAG,
    annotate_sse_details_flags,
    apply_job_sse_org_gate,
    demote_org_job_sse,
    job_sse_was_deferred,
    job_sse_was_gated,
    org_is_sse_from_job_row,
    resolve_job_is_sse,
)


def test_resolve_job_is_sse_requires_org_yes():
    assert resolve_job_is_sse(True, True) is True
    assert resolve_job_is_sse(True, False) is False
    assert resolve_job_is_sse(True, None) is None
    assert resolve_job_is_sse(False, True) is False
    assert resolve_job_is_sse(False, False) is False
    assert resolve_job_is_sse(False, None) is False
    assert resolve_job_is_sse(None, True) is None


def test_gate_helpers():
    assert job_sse_was_gated(True, False) is True
    assert job_sse_was_gated(True, True) is False
    assert job_sse_was_deferred(True, None) is True
    assert job_sse_was_deferred(True, False) is False
    flags = annotate_sse_details_flags(["a"], gated=True)
    assert flags == ["a", ORG_SSE_GATE_FLAG]


def test_apply_job_sse_org_gate():
    resolved, flags, deferred = apply_job_sse_org_gate(
        proposed_is_sse=True, org_is_sse=False, flags=["x"]
    )
    assert resolved is False
    assert deferred is False
    assert ORG_SSE_GATE_FLAG in flags

    resolved, flags, deferred = apply_job_sse_org_gate(
        proposed_is_sse=True, org_is_sse=None
    )
    assert resolved is None
    assert deferred is True


def test_org_is_sse_from_job_row():
    assert org_is_sse_from_job_row({"organizations": {"is_sse": True}}) is True
    assert org_is_sse_from_job_row({"organizations": {"is_sse": False}}) is False
    assert org_is_sse_from_job_row({"organizations": {"is_sse": None}}) is None
    assert org_is_sse_from_job_row({"org_is_sse": True}) is True
    assert org_is_sse_from_job_row({}) is None
    assert org_is_sse_from_job_row(None) is None


def test_demote_org_job_sse():
    execute = MagicMock(return_value=MagicMock(data=[{"id": "a"}, {"id": "b"}]))
    eq_sse = MagicMock(return_value=MagicMock(execute=execute))
    eq_org = MagicMock(return_value=MagicMock(eq=eq_sse))
    update = MagicMock(return_value=MagicMock(eq=eq_org))
    table = MagicMock(return_value=MagicMock(update=update))
    supabase = MagicMock()
    supabase.table = table

    assert demote_org_job_sse(supabase, 7) == 2
    table.assert_called_with("jobs")
    update.assert_called_with({"is_sse": False})
    eq_org.assert_called_with("organization_id", 7)
    eq_sse.assert_called_with("is_sse", True)

    assert demote_org_job_sse(supabase, None) == 0

    execute.side_effect = RuntimeError("db down")
    assert demote_org_job_sse(supabase, 7) == 0
