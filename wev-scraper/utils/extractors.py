"""Shared extraction helpers for scraper field parsing."""

from __future__ import annotations

import re
from typing import Iterable, Optional, Sequence


def first_nonempty(*values: Optional[str]) -> Optional[str]:
    """Return the first non-empty string from values."""
    for v in values:
        if v and str(v).strip():
            return str(v).strip()
    return None


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
                value = match.group(1).strip()
                value = re.split(r"\n|Term:|Language:", value)[0].strip()
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
            value = match.group(1).strip()
            value = re.split(r"\n|Term:|Language:", value)[0].strip()
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


def detect_employment_type_from_texts(texts: Iterable[str | None]) -> Optional[str]:
    """Detect employment type keywords from a list of text blobs."""
    if not texts:
        return None
    combined = " ".join([t for t in texts if t])
    if not combined:
        return None
    lower = combined.lower()
    patterns = [
        ("full-time", ["full-time", "full time"]),
        ("part-time", ["part-time", "part time"]),
        ("internship", ["internship", "intern"]),
        ("volunteer", ["volunteer", "volunteering"]),
        ("contract", ["contract", "contractor"]),
        ("temporary", ["temporary", "temp"]),
        ("seasonal", ["seasonal"]),
        ("casual", ["casual"]),
    ]
    for label, keys in patterns:
        if any(k in lower for k in keys):
            return label
    return None
