"""
Municipality normalization for scraped jobs — no hand-maintained city lists.

- Storage: Unicode NFC + trim (consistent with bulletin display folding).
- Deduplication of accent variants is handled in the bulletin (filters) and optionally
  by cluster backfill (see utils.backfill_municipality_canonical).
"""

from __future__ import annotations

import re
import unicodedata
from typing import Optional

_CTRL = re.compile(r"[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]")


def normalize_location(s: str) -> str:
    """Lowercase, NFD, strip combining marks — same idea as bulletin normalizeLocation."""
    return "".join(
        c
        for c in unicodedata.normalize("NFD", s.lower())
        if unicodedata.category(c) != "Mn"
    )


def pick_preferred_municipality_label(variants: list[str]) -> str:
    """Prefer ASCII (non-accented) spellings; ties break by shorter length, then lexicographic."""
    nfc = list(
        dict.fromkeys(
            unicodedata.normalize("NFC", v.strip())
            for v in variants
            if v and v.strip()
        )
    )
    if not nfc:
        return ""
    if len(nfc) == 1:
        return nfc[0]

    def score(x: str) -> tuple[int, int, str]:
        non_ascii = sum(1 for c in x if ord(c) > 127)
        return (non_ascii, len(x), x)

    return min(nfc, key=score)


def nfc_trim_municipality(municipality: Optional[str]) -> Optional[str]:
    """Normalize whitespace and Unicode NFC for stored municipality."""
    if not municipality:
        return None
    text = _CTRL.sub("", municipality)
    text = " ".join(text.split()).strip()
    if not text:
        return None
    return unicodedata.normalize("NFC", text)


def canonicalize_municipality(
    municipality: Optional[str],
    _province: Optional[str] = None,
) -> Optional[str]:
    """Normalize municipality for persistence (Generic NFC + trim)."""
    del _province
    # Just do standard Unicode normalization (NFC) and trimming.
    # We rely on the search_municipality column and UI-level merging
    # to handle accent variants generically.
    return nfc_trim_municipality(municipality)
