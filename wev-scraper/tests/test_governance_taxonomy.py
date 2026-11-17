"""Governance taxonomy: SQL ↔ Python sync and resolver behavior.

The migration CHECK constraints hand-list the governance codes, and the DB
will reject any insert whose code is not in those lists. If the Python source
of truth (``governance_taxonomy``) and the migration ever drift, the assessor
would silently start producing rows the DB refuses. These tests lock the two
lists together so that drift fails in CI, not in production.
"""

from __future__ import annotations

import re
from pathlib import Path

from utils.governance_taxonomy import (
    EXCLUDED_CATEGORY,
    EXCLUDED_SUBTYPE,
    VALID_CATEGORIES,
    VALID_SUBTYPES,
    category_for_subtype,
    resolve_governance,
)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_MIGRATION = (
    _REPO_ROOT
    / "supabase"
    / "migrations"
    / "20261116190000_org_governance_taxonomy.sql"
)


def _codes_in_check(constraint_name: str) -> set[str]:
    """Return the quoted codes listed in a named CHECK ... IN (...) block."""
    sql = _MIGRATION.read_text()
    # Grab from the constraint name up to the IN (...) closing paren.
    match = re.search(
        rf"{constraint_name}\b.*?IN \((.*?)\)",
        sql,
        re.DOTALL,
    )
    assert match, f"Could not find CHECK ... IN (...) for {constraint_name}"
    return set(re.findall(r"'([^']+)'", match.group(1)))


def test_subtype_check_matches_python_valid_subtypes():
    sql_codes = _codes_in_check("organizations_governance_subtype_check")
    assert sql_codes == set(VALID_SUBTYPES), (
        "Migration subtype CHECK and VALID_SUBTYPES have drifted. "
        f"Only in SQL: {sql_codes - set(VALID_SUBTYPES)}; "
        f"only in Python: {set(VALID_SUBTYPES) - sql_codes}"
    )


def test_category_check_matches_python_valid_categories():
    sql_codes = _codes_in_check("organizations_governance_category_check")
    assert sql_codes == set(VALID_CATEGORIES), (
        "Migration category CHECK and VALID_CATEGORIES have drifted. "
        f"Only in SQL: {sql_codes - set(VALID_CATEGORIES)}; "
        f"only in Python: {set(VALID_CATEGORIES) - sql_codes}"
    )


def test_every_subtype_category_prefix_is_a_valid_category():
    """The DB enforces category = left(subtype, 5); mirror that invariant here."""
    for subtype in VALID_SUBTYPES:
        category = category_for_subtype(subtype)
        assert category in VALID_CATEGORIES
        if subtype == EXCLUDED_SUBTYPE:
            assert category == EXCLUDED_CATEGORY
        else:
            assert category == subtype[:5]


def test_resolve_governance_not_sse_is_always_excluded():
    assert resolve_governance("GOV_1_1_WORKER_COOP", "GOV_1", is_sse=False) == (
        EXCLUDED_SUBTYPE,
        EXCLUDED_CATEGORY,
    )


def test_resolve_governance_sse_derives_category_and_ignores_model_mismatch():
    # Model returned a wrong category; resolver must derive the right one.
    assert resolve_governance("GOV_2_1_CREDIT_UNION", "GOV_5", is_sse=True) == (
        "GOV_2_1_CREDIT_UNION",
        "GOV_2",
    )


def test_resolve_governance_sse_without_usable_subtype_stays_null():
    assert resolve_governance(EXCLUDED_SUBTYPE, EXCLUDED_CATEGORY, is_sse=True) == (
        None,
        None,
    )
    assert resolve_governance(None, None, is_sse=True) == (None, None)
    assert resolve_governance("not_a_code", None, is_sse=True) == (None, None)
