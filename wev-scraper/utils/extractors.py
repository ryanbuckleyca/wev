"""Shared extraction helpers for scraper field parsing."""

from __future__ import annotations

import re
from typing import Iterable, Optional, Sequence

# Truncate labeled field values before the next common job-ad field heading.
# GoodWork often flattens "Job Title: X Project: Y Organization: Z" onto one line.
_LABELED_VALUE_STOP = re.compile(
    r"(?:\n|"
    r"Term:|Language:|Project:|Organization:|Company:|Farm:|Employer:|Business:|"
    r"Location:|Work Location:|Work location:|Type:|Job Types?:|Hourly Wage:|"
    r"Salary:|Wage:|Compensation:|Reports? to:|Work Arrangement:|Hours:|"
    r"Start Date:|End Date:|Hiring Process:|Position Overview:|About\b)",
    re.IGNORECASE,
)


def first_nonempty(*values: Optional[str]) -> Optional[str]:
    """Return the first non-empty string from values."""
    for v in values:
        if v and str(v).strip():
            return str(v).strip()
    return None


def _trim_labeled_value(value: str) -> str:
    return _LABELED_VALUE_STOP.split(value, maxsplit=1)[0].strip(" \t-,;:")


def extract_labeled_value(
    blocks: Iterable[str],
    labels: Sequence[str],
) -> Optional[str]:
    """Extract the first value that follows any of the labels from text blocks."""
    for block in blocks:
        if not block:
            continue
        for label in labels:
            pattern = re.compile(rf"{re.escape(label)}\s*(.+?)(?:\n|$)", re.IGNORECASE)
            match = pattern.search(block)
            if match:
                value = _trim_labeled_value(match.group(1))
                if value:
                    return value
    return None


def extract_labeled_value_from_text(text: str, labels: Sequence[str]) -> Optional[str]:
    """Extract labeled value from a single text blob."""
    if not text:
        return None
    for label in labels:
        pattern = re.compile(rf"{re.escape(label)}\s*(.+?)(?:\n|$)", re.IGNORECASE)
        match = pattern.search(text)
        if match:
            value = _trim_labeled_value(match.group(1))
            if value:
                return value
    return None


def normalize_salary_string(s: Optional[str]) -> Optional[str]:
    """Clean and normalize an extracted salary string for consistent output."""
    if not s or not str(s).strip():
        return None
    s = str(s).strip()
    s = re.sub(r"\s+", " ", re.sub(r"[–—]", "-", s))
    s = s.rstrip(" ,.")
    for suffix in [
        " annual salary", " per year", " to commensurate with experience",
        " based on experience and qualifications.", " based on experience and qualifications",
    ]:
        if s.lower().endswith(suffix.lower()):
            s = s[: -len(suffix)].strip()
    s = s.rstrip(" ,.")
    return s if s and re.search(r"\$[\d,]+", s) else None


def extract_salary_from_text(text: str) -> Optional[str]:
    """Extract a salary/wage string from arbitrary text (English and French).

    Handles formats like:
      - "Salary: $50,000 - $60,000"           (EN labelled)
      - "Wage: $25/hr"                         (EN labelled)
      - "Salaire : 25,63 $"                    (FR labelled, $ after)
      - "Taux horaire : 24,00 $"               (FR labelled)
      - "Rémunération : 26.28$ à 28.15$"       (FR labelled)
      - "Salaire à partir de 75 000$"          (FR labelled, space-thousands)
      - "28$ de l'heure"                       (FR unlabelled, /heure suffix)
      - "$50,000 - $60,000 annual salary"      (EN bare range)
    """
    if not text:
        return None

    # --- Amount building blocks ---
    # EN: $X,XXX or $X,XXX.XX
    en_amount = r"\$[\d,]+(?:\.\d+)?"
    # FR: digits with optional space-thousands and comma/dot decimal, then $
    #     e.g. "75 000$", "25,63 $", "24.57 $"
    #     Space only counts as thousands separator when between digit groups
    fr_amount = r"\d(?:\d|(?<=\d) (?=\d)|[,.](?=\d))*\s*\$"

    any_amount = rf"(?:{en_amount}|{fr_amount})"
    range_sep = r"\s*(?:-|–|—|to|à)\s*"
    amount_or_range = rf"{any_amount}(?:{range_sep}{any_amount})?"

    patterns = [
        # FR labelled: keyword + non-digit/non-$ filler + first amount
        (
            r"(?:salaire(?:\s+(?:horaire|mensuel(?:le)?|de base))?|r[ée]mun[ée]ration"
            r"|taux horaire|compensation|wage|salary)"
            r"[^0-9$\n]{0,80}"
            rf"({amount_or_range})"
        ),
        # EN labelled range or single: "Salary: $X - $Y" / "Wage: $X/hr"
        (
            r"(?:compensation|salary|wage|pay)\s*:\s*"
            rf"({en_amount}(?:{range_sep}{en_amount})?)"
        ),
        # EN bare range: "$X - $Y annual salary" / "$X to $Y based on experience"
        (
            rf"({en_amount}{range_sep}{en_amount})"
        ),
        # FR unlabelled: amount followed by /heure or /h or /hr or "de l'heure"
        (
            rf"({amount_or_range})\s*(?:/\s*(?:heure|h\b|hr\b)|de\s+l['']heure)"
        ),
    ]

    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            raw = m.group(1).strip()
            if raw:
                return raw

    return None


def extract_title_from_blocks(blocks: Iterable[str], labels: Sequence[str]) -> Optional[str]:
    """Extract title after labels like 'Position:' from text blocks."""
    return extract_labeled_value(blocks, labels)


# Current role type — not future conversion / growth language.
_EMPLOYMENT_TYPE_PHRASE = (
    r"(?:full[\s-]?time|part[\s-]?time|temps\s+plein|temps\s+partiel|"
    r"permanent|contract|contractor|temporary|temporaire|seasonal|casual|"
    r"internship|intern|volunteer(?:ing)?)"
)
# "full-time contract", "permanent full-time", etc.
_EMPLOYMENT_TYPE_RUN = (
    rf"(?:{_EMPLOYMENT_TYPE_PHRASE}(?:\s+(?:or\s+)?{_EMPLOYMENT_TYPE_PHRASE})*)"
)

# Hedge / future-state clauses that mention a type without describing the role now
# (e.g. "possibility of becoming a full-time contract position").
_ASPIRATIONAL_EMPLOYMENT_TYPE = re.compile(
    rf"""
    (?:
        (?:
            possibility|potential|opportunity|option|chance|path|prospect|
            possibilit[eé]|potentiel|occasion
        )
        \s+(?:of|to|for|de|d['’])?\s*
        (?:
            becom(?:e|ing)|convert(?:ing)?|transition(?:ing)?|mov(?:e|ing)|
            grow(?:ing)?|advance(?:ment)?|lead(?:ing)?\s+to|devenir|passer|évoluer
        )?
        \s*(?:a\s+|an\s+|to\s+|into\s+|au\s+|à\s+|en\s+|vers\s+)?
        {_EMPLOYMENT_TYPE_RUN}
    |
        (?:may|might|could|can|would|peut|pourrait)
        \s+(?:be\s+|become\s+|lead\s+to\s+|devenir\s+)?
        (?:a\s+|an\s+)?
        {_EMPLOYMENT_TYPE_RUN}
    |
        (?:transition(?:ing)?|convert(?:ing)?|path|route|voie)
        \s+(?:to|into|vers|à)\s+
        (?:a\s+|an\s+)?
        {_EMPLOYMENT_TYPE_RUN}
    )
    """,
    re.IGNORECASE | re.VERBOSE,
)

_EMPLOYMENT_TYPE_PATTERNS: list[tuple[str, list[str]]] = [
    ("full-time", ["full-time", "full time", "temps plein"]),
    ("part-time", ["part-time", "part time", "temps partiel"]),
    ("internship", ["internship", "intern"]),
    ("volunteer", ["volunteer", "volunteering"]),
    ("contract", ["contract", "contractor"]),
    ("temporary", ["temporary", "temp", "temporaire"]),
    ("seasonal", ["seasonal"]),
    ("casual", ["casual"]),
]


def _neutralize_aspirational_employment_types(text: str) -> str:
    """Blank out hedged / future-state type mentions so they are not scored."""
    return _ASPIRATIONAL_EMPLOYMENT_TYPE.sub(" ", text)


def _employment_type_key_pattern(key: str) -> re.Pattern[str]:
    """Match *key* as a whole token so ``intern`` does not hit ``internal``."""
    return re.compile(rf"(?<![\w-]){re.escape(key)}(?![\w-])", re.IGNORECASE)


def detect_employment_type_from_texts(texts: Iterable[str | None]) -> Optional[str]:
    """Detect employment type keywords from a list of text blobs.

    Ignores aspirational / future-conversion wording (path to full-time, may become
    contract, etc.) and returns the earliest remaining type mention so a current
    part-time role is not overwritten by a later full-time growth clause.

    Uses token boundaries so substrings do not false-positive (e.g. ``intern`` in
    ``internal`` / ``international``, ``temp`` in ``attempt``).
    """
    if not texts:
        return None
    combined = " ".join([t for t in texts if t])
    if not combined:
        return None
    lower = _neutralize_aspirational_employment_types(combined).lower()

    best_label: Optional[str] = None
    best_pos = len(lower)
    for label, keys in _EMPLOYMENT_TYPE_PATTERNS:
        for key in keys:
            match = _employment_type_key_pattern(key).search(lower)
            if match and match.start() < best_pos:
                best_pos = match.start()
                best_label = label
    return best_label
