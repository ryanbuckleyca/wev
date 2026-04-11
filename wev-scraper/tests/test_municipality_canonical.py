"""Tests for municipality canonicalization."""

from __future__ import annotations

import pytest

from utils.municipality_canonical import (
    canonicalize_municipality,
    pick_preferred_municipality_label,
)


@pytest.mark.parametrize(
    ("municipality", "expected"),
    [
        ("Montreal", "Montreal"),
        ("MONTRÉAL", "MONTRÉAL"),
        ("Montréal", "Montréal"),
        (None, None),
        ("", None),
        ("  ", None),
    ],
)
def test_canonicalize_municipality(
    municipality: str | None,
    expected: str | None,
) -> None:
    assert canonicalize_municipality(municipality) == expected


@pytest.mark.parametrize(
    ("variants", "expected"),
    [
        (["Montreal", "Montréal"], "Montreal"),
        (["Montréal", "Montreal"], "Montreal"),
        (["Quebec City", "Québec City"], "Quebec City"),
        (["Ottawa"], "Ottawa"),
    ],
)
def test_pick_preferred_prefers_ascii(variants: list[str], expected: str) -> None:
    assert pick_preferred_municipality_label(variants) == expected
