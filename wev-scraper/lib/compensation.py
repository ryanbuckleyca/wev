"""Structured compensation extraction from raw wage text.

Pure regex implementation — no LLM. The wage strings in the DB are already
short, extracted salary phrases (e.g. '26,78$', '67 000$ à 80 000$', '$25/hr').
Regex is faster, deterministic, and more accurate than a small LLM for this task.

Provides:
- CompensationExtraction dataclass
- extract_compensation: regex-based extraction
- currency_guard: nulls structured fields for non-CAD currencies
- normalize_biweekly: maps "par quinzaine" to WEEK unit with halved amounts
- extract_and_guard: main entry point chaining all steps
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Vague / non-extractable patterns
# ---------------------------------------------------------------------------

_VAGUE_PATTERNS = re.compile(
    r"^\s*(competitive|to be discussed|à discuter|selon expérience|"
    r"selon l'expérience|à déterminer|to be determined|negotiable|"
    r"à négocier|tbd|n/a|na|not available|à confirmer|to be confirmed|"
    r"selon la convention|selon l'échelle)\s*$",
    re.IGNORECASE,
)

_BIWEEKLY_PATTERN = re.compile(r"par quinzaine", re.IGNORECASE)

# ---------------------------------------------------------------------------
# Unit keyword patterns
# ---------------------------------------------------------------------------

_HOUR_RE = re.compile(
    r"heure|horaire|/h\b|/hr\b|de l'heure|par heure|\$/h\b|per hour|hourly",
    re.IGNORECASE,
)
_DAY_RE = re.compile(r"\bjour\b|/day\b|par jour|per day|daily", re.IGNORECASE)
_WEEK_RE = re.compile(r"semaine|/week\b|par semaine|hebdo|per week|weekly", re.IGNORECASE)
_MONTH_RE = re.compile(r"\bmois\b|/month\b|par mois|mensuel|per month|monthly", re.IGNORECASE)
_YEAR_RE = re.compile(r"ann[ée]e|/year\b|annuel|annual|par an\b|per year|yearly", re.IGNORECASE)

# ---------------------------------------------------------------------------
# Number parsing
# Handles all formats seen in the DB:
#   French decimal:    25,53   25,78   18,50
#   French thousands:  67 000  58 000  25 000
#   French both:       58 614,50
#   English decimal:   25.63   29.73
#   English thousands: 100,000  75,000
#   English both:      $56,987.50
#   Plain integer:     18  21  35  4700  100000
# ---------------------------------------------------------------------------

# Matches a salary number token: optional $, digits with optional
# space/comma/dot separators, optional trailing $
_NUM_TOKEN_RE = re.compile(
    r"""
    \$?                          # optional leading $
    (
      \d{1,3}                    # 1-3 digits
      (?:[\s\u00a0]\d{3})+       # French thousands: "67 000", "100 000"
      (?:[,\.]\d{1,2})?          # optional decimal
    |
      \d{1,3}                    # 1-3 digits
      (?:,\d{3})+                # English thousands: "67,000", "100,000"
      (?:\.\d{1,2})?             # optional decimal
    |
      \d+[,\.]\d{1,2}            # decimal number: "25,53" "25.63" "18,50"
    |
      \d+                        # plain integer: "18" "21" "4700"
    )
    \s*\$?                       # optional trailing $
    """,
    re.VERBOSE,
)


def _parse_number(s: str) -> Optional[float]:
    """Parse a number token, handling French and English formatting."""
    s = s.strip().replace("\u00a0", " ").replace("$", "").strip()

    has_space = " " in s
    has_comma = "," in s
    has_dot = "." in s

    if has_space:
        # French thousands: "67 000" or "67 000,53"
        s = s.replace(" ", "")
        if has_comma:
            s = s.replace(",", ".")
    elif has_comma and has_dot:
        # English: "25,000.50" — comma is thousands separator
        s = s.replace(",", "")
    elif has_comma:
        # Ambiguous: "25,53" (French decimal) vs "25,000" (English thousands)
        parts = s.split(",")
        if len(parts) == 2 and len(parts[1]) <= 2:
            # French decimal: "25,53" → 25.53
            s = s.replace(",", ".")
        else:
            # English thousands: "25,000" → 25000
            s = s.replace(",", "")

    try:
        return float(s)
    except ValueError:
        return None


def _extract_numbers(wage_text: str) -> tuple[Optional[float], Optional[float]]:
    """Extract all salary amounts from wage text, return (min, max)."""
    tokens = _NUM_TOKEN_RE.findall(wage_text)
    amounts = []
    for tok in tokens:
        val = _parse_number(tok)
        if val is not None and val > 0:
            amounts.append(val)

    if not amounts:
        return None, None
    if len(amounts) == 1:
        return amounts[0], None
    return min(amounts), max(amounts)


def _infer_unit(wage_text: str, min_dollars: Optional[float]) -> Optional[str]:
    """Infer unit from keywords first, then magnitude as fallback."""
    if _HOUR_RE.search(wage_text):
        return "HOUR"
    if _DAY_RE.search(wage_text):
        return "DAY"
    if _WEEK_RE.search(wage_text):
        return "WEEK"
    if _MONTH_RE.search(wage_text):
        return "MONTH"
    if _YEAR_RE.search(wage_text):
        return "YEAR"

    if min_dollars is None:
        return None

    # Magnitude fallback — no unit keyword found, so we guess from the amount.
    # Thresholds are tuned for Canadian salary data. Confidence is reduced to
    # 0.5 when this path is taken (see extract_compensation).
    if min_dollars >= 20_000:
        return "YEAR"
    if min_dollars >= 1_500:
        return "MONTH"
    if min_dollars >= 200:
        return "WEEK"
    return "HOUR"  # < 200 is clearly hourly (e.g. $18, $26.78)


def _detect_currency(wage_text: str) -> str:
    """Detect currency. Defaults to CAD."""
    if re.search(r"\bUSD\b|\bUS\$", wage_text, re.IGNORECASE):
        return "USD"
    if re.search(r"\bEUR\b|€", wage_text):
        return "EUR"
    if re.search(r"\bGBP\b|£", wage_text):
        return "GBP"
    return "CAD"


def _extract_hours_per_week(wage_text: str) -> Optional[int]:
    """Extract explicitly stated hours per week."""
    m = re.search(r"(\d+)\s*h(?:eures?)?(?:/|\s+par\s+)semaine", wage_text, re.IGNORECASE)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+)\s*(?:hours?|hrs?)\s*(?:per|/)\s*week", wage_text, re.IGNORECASE)
    if m:
        return int(m.group(1))
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

@dataclass
class CompensationExtraction:
    unit_text: Optional[str]    # 'HOUR'|'DAY'|'WEEK'|'MONTH'|'YEAR'|None
    min_value: Optional[int]    # CAD cents
    max_value: Optional[int]    # CAD cents
    hours_per_week: Optional[int]
    currency: Optional[str]
    raw_note: Optional[str]
    confidence: float           # 0.0–1.0


def _null_extraction(raw_note: str = "extraction_failed") -> CompensationExtraction:
    return CompensationExtraction(
        unit_text=None, min_value=None, max_value=None,
        hours_per_week=None, currency=None, raw_note=raw_note, confidence=0.0,
    )


def _to_cents(dollars: Optional[float]) -> Optional[int]:
    if dollars is None:
        return None
    return int(round(dollars * 100))


def extract_compensation(wage_text: str) -> CompensationExtraction:
    """Extract structured compensation from a raw wage string using regex."""
    min_d, max_d = _extract_numbers(wage_text)
    unit = _infer_unit(wage_text, min_d)
    currency = _detect_currency(wage_text)
    hours = _extract_hours_per_week(wage_text)

    has_keyword = any(p.search(wage_text) for p in [_HOUR_RE, _DAY_RE, _WEEK_RE, _MONTH_RE, _YEAR_RE])
    if min_d is not None and has_keyword:
        confidence = 0.9
    elif min_d is not None:
        # Unit inferred from magnitude only — lower confidence to signal the guess
        confidence = 0.5
    else:
        confidence = 0.0

    return CompensationExtraction(
        unit_text=unit,
        min_value=_to_cents(min_d),
        max_value=_to_cents(max_d),
        hours_per_week=hours,
        currency=currency,
        raw_note=None,
        confidence=confidence,
    )


def currency_guard(extraction: CompensationExtraction) -> CompensationExtraction:
    """Null structured fields when currency is not CAD."""
    if extraction.currency is not None and extraction.currency != "CAD":
        note = extraction.currency
        if extraction.min_value is not None:
            note = f"${extraction.min_value / 100:.2f} {extraction.currency}"
        return CompensationExtraction(
            unit_text=None, min_value=None, max_value=None, hours_per_week=None,
            currency=extraction.currency, raw_note=note, confidence=extraction.confidence,
        )
    return extraction


def normalize_biweekly(extraction: CompensationExtraction, wage_text: str) -> CompensationExtraction:
    """Map 'par quinzaine' (bi-weekly) to WEEK unit with halved amounts."""
    if not _BIWEEKLY_PATTERN.search(wage_text):
        return extraction
    return CompensationExtraction(
        unit_text="WEEK",
        min_value=(round(extraction.min_value / 2)) if extraction.min_value is not None else None,
        max_value=(round(extraction.max_value / 2)) if extraction.max_value is not None else None,
        hours_per_week=extraction.hours_per_week,
        currency=extraction.currency,
        raw_note=extraction.raw_note,
        confidence=extraction.confidence,
    )


def extract_and_guard(wage_text: str) -> CompensationExtraction:
    """Main entry point: extract + apply all guards."""
    if not wage_text or not wage_text.strip():
        return _null_extraction("extraction_failed")

    if _VAGUE_PATTERNS.match(wage_text):
        return _null_extraction("vague")

    extraction = extract_compensation(wage_text)
    extraction = currency_guard(extraction)
    extraction = normalize_biweekly(extraction, wage_text)

    # Ensure max >= min — if inverted, swap and flag it so callers can audit
    if (extraction.min_value is not None and extraction.max_value is not None
            and extraction.max_value < extraction.min_value):
        logger.warning(
            "min/max inverted for wage=%r (min=%s, max=%s) — swapping",
            wage_text, extraction.min_value, extraction.max_value,
        )
        extraction = CompensationExtraction(
            unit_text=extraction.unit_text,
            min_value=extraction.max_value,
            max_value=extraction.min_value,
            hours_per_week=extraction.hours_per_week,
            currency=extraction.currency,
            raw_note=(extraction.raw_note or "") + " [min_max_swapped]",
            confidence=extraction.confidence,
        )

    return extraction
