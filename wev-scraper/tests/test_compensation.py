"""Unit tests for extract_compensation and currency_guard.

Validates: Requirements 4.2, 4.3, 4.4, 4.9
"""
import pytest

from lib.compensation import (
    CompensationExtraction,
    currency_guard,
    extract_and_guard,
    extract_compensation,
)

# ---------------------------------------------------------------------------
# extract_compensation tests
# ---------------------------------------------------------------------------

class TestExtractCompensation:
    """Tests for extract_compensation() -- pure regex, no LLM."""

    def test_cad_hourly(self):
        """CAD hourly: unit detected and amount converted to cents.

        Validates: Requirement 4.6
        """
        result = extract_compensation("25$/heure")

        assert result.unit_text == "HOUR"
        assert result.min_value == 2500          # 25.00 * 100
        assert result.max_value is None
        assert result.currency == "CAD"
        assert result.confidence == pytest.approx(0.9)

    def test_hours_per_week_extracted(self):
        """Explicit hours/week in wage text is captured in hours_per_week.

        Validates: Requirement 4.6
        """
        result = extract_compensation("28$ de l'heure, 35 heures/semaine")

        assert result.hours_per_week == 35

    def test_cad_annual(self):
        """CAD annual range: both min and max converted to cents.

        Validates: Requirement 4.6
        """
        result = extract_compensation("60 000$ a 75 000$ par annee")

        assert result.unit_text == "YEAR"
        assert result.min_value == 6_000_000     # 60000 * 100
        assert result.max_value == 7_500_000     # 75000 * 100
        assert result.hours_per_week is None
        assert result.currency == "CAD"

    def test_no_numbers_returns_null_extraction(self):
        """Wage text with no parseable numbers: all structured fields None, confidence 0.0.

        Validates: Requirement 4.9 -- graceful handling of unextractable input.
        """
        result = extract_compensation("some wage text with no numbers")

        assert result.unit_text is None
        assert result.min_value is None
        assert result.max_value is None
        assert result.hours_per_week is None
        assert result.confidence == 0.0


# ---------------------------------------------------------------------------
# currency_guard tests
# ---------------------------------------------------------------------------

class TestCurrencyGuard:
    """Tests for currency_guard()."""

    def test_usd_nulls_structured_fields_and_sets_raw_note(self):
        """Non-CAD currency: structured fields nulled, raw_note contains currency.

        Validates: Requirement 4.2
        """
        extraction = CompensationExtraction(
            unit_text="YEAR",
            min_value=10_000_000,
            max_value=None,
            hours_per_week=None,
            currency="USD",
            raw_note=None,
            confidence=0.85,
        )

        result = currency_guard(extraction)

        assert result.unit_text is None
        assert result.min_value is None
        assert result.max_value is None
        assert result.hours_per_week is None
        assert result.raw_note is not None
        assert "USD" in result.raw_note

    def test_cad_passes_through_unchanged(self):
        """CAD currency: extraction returned unchanged."""
        extraction = CompensationExtraction(
            unit_text="HOUR",
            min_value=2500,
            max_value=None,
            hours_per_week=40,
            currency="CAD",
            raw_note=None,
            confidence=0.9,
        )

        result = currency_guard(extraction)

        assert result.unit_text == "HOUR"
        assert result.min_value == 2500
        assert result.currency == "CAD"

    def test_none_currency_passes_through(self):
        """None currency: extraction returned unchanged (no guard applied)."""
        extraction = CompensationExtraction(
            unit_text=None,
            min_value=None,
            max_value=None,
            hours_per_week=None,
            currency=None,
            raw_note="vague",
            confidence=0.0,
        )

        result = currency_guard(extraction)

        assert result.raw_note == "vague"
        assert result.unit_text is None


# ---------------------------------------------------------------------------
# extract_and_guard integration tests
# ---------------------------------------------------------------------------

class TestExtractAndGuard:
    """Integration tests for the full extract_and_guard pipeline."""

    def test_usd_currency_guard_applied(self):
        """USD input: after currency_guard all structured fields None, raw_note contains 'USD'.

        Validates: Requirement 4.2
        """
        result = extract_and_guard("$100,000 USD annually")

        assert result.unit_text is None
        assert result.min_value is None
        assert result.max_value is None
        assert result.hours_per_week is None
        assert result.raw_note is not None
        assert "USD" in result.raw_note

    def test_biweekly_normalization(self):
        """'par quinzaine': unit set to WEEK, amounts halved.

        Validates: Requirement 4.4
        2000$ bi-weekly -> 1000$/week -> 100000 cents/week.
        """
        result = extract_and_guard("2000$ par quinzaine")

        assert result.unit_text == "WEEK"
        assert result.min_value == 100_000       # 2000 * 100 / 2 = 100000 cents
        assert result.max_value is None

    def test_vague_string_competitive(self):
        """'Competitive': all structured fields None, raw_note='vague', confidence=0.0.

        Validates: Requirement 4.3
        """
        result = extract_and_guard("Competitive")

        assert result.unit_text is None
        assert result.min_value is None
        assert result.max_value is None
        assert result.hours_per_week is None
        assert result.raw_note == "vague"
        assert result.confidence == 0.0

    @pytest.mark.parametrize("vague_text", [
        "Competitive",
        "To be discussed",
        "negotiable",
        "TBD",
    ])
    def test_vague_strings_parametrized(self, vague_text):
        """Various vague strings all return null extraction with raw_note='vague'.

        Validates: Requirement 4.3
        """
        result = extract_and_guard(vague_text)

        assert result.unit_text is None
        assert result.min_value is None
        assert result.raw_note == "vague"
        assert result.confidence == 0.0

    def test_empty_and_whitespace_returns_extraction_failed(self):
        """Empty/whitespace input: raw_note='extraction_failed', all fields None.

        Validates: Requirement 4.9 -- graceful handling of missing wage data.
        """
        for bad_input in ("", "   "):
            result = extract_and_guard(bad_input)
            assert result.unit_text is None
            assert result.min_value is None
            assert result.max_value is None
            assert result.hours_per_week is None
            assert result.confidence == 0.0
            assert result.raw_note == "extraction_failed"


# ---------------------------------------------------------------------------
# _infer_unit magnitude fallback tests
# ---------------------------------------------------------------------------

class TestInferUnitMagnitudeFallback:
    """Tests for the keyword-less magnitude-based unit inference path."""

    def test_bare_annual_salary_inferred_as_year(self):
        """$45,000 with no unit keyword: inferred as YEAR, confidence 0.5."""
        result = extract_compensation("$45,000")

        assert result.unit_text == "YEAR"
        assert result.min_value == 4_500_000
        assert result.confidence == pytest.approx(0.5)

    def test_bare_hourly_amount_inferred_as_hour(self):
        """$18 with no unit keyword: inferred as HOUR (< 200 threshold), confidence 0.5."""
        result = extract_compensation("$18")

        assert result.unit_text == "HOUR"
        assert result.min_value == 1800
        assert result.confidence == pytest.approx(0.5)

    def test_magnitude_fallback_confidence_lower_than_keyword_match(self):
        """Magnitude-inferred confidence (0.5) is lower than keyword-matched (0.9)."""
        keyword_result = extract_compensation("25$/heure")
        magnitude_result = extract_compensation("$25")

        assert keyword_result.confidence > magnitude_result.confidence


# ---------------------------------------------------------------------------
# min/max swap signal tests
# ---------------------------------------------------------------------------

class TestMinMaxSwap:
    """Tests that inverted min/max is corrected and flagged."""

    def test_inverted_range_is_swapped(self):
        """If the regex picks up values in wrong order, extract_and_guard corrects them."""
        # Construct an extraction with inverted range directly
        from lib.compensation import extract_and_guard
        # Use a wage string that would produce a valid range — verify swap via raw_note
        # We test the guard indirectly: a string where regex finds two values
        result = extract_and_guard("75 000$ a 60 000$ par annee")

        # After swap: min should be the smaller value
        assert result.min_value is not None and result.max_value is not None
        assert result.min_value <= result.max_value

    def test_inverted_range_sets_raw_note(self):
        """Swapped min/max is flagged in raw_note with '[min_max_swapped]'."""
        # Force an inverted extraction by patching extract_compensation
        from unittest.mock import patch

        from lib.compensation import CompensationExtraction

        inverted = CompensationExtraction(
            unit_text="YEAR",
            min_value=7_500_000,
            max_value=6_000_000,  # inverted
            hours_per_week=None,
            currency="CAD",
            raw_note=None,
            confidence=0.9,
        )

        with patch("lib.compensation.extract_compensation", return_value=inverted):
            result = extract_and_guard("some wage")

        assert result.min_value == 6_000_000
        assert result.max_value == 7_500_000
        assert result.raw_note is not None
        assert "min_max_swapped" in result.raw_note
