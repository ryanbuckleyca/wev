"""Reverse-lookup vocabulary for the SSE sector taxonomy crosswalk.

Parses ``term_crosswalk`` cells from ``shared/taxonomy/sectors.json`` (CMC,
Chantier, CCEDNet Buy Social, RIPESS) into a searchable alias index so that:

1. scraped source categories can resolve to a wev ``sector_id`` when the
   vocabulary matches, and
2. LLM prompts can list source-directory aliases alongside each sector.

Soft sheet cells such as ``(No direct equivalent)``, ``(Included in …)``,
and ``(Covered under …)`` are provenance for the forward crosswalk only —
they do **not** create reverse aliases (those parent labels are ambiguous).
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal

from utils.sector_prompts import (
    CROSSWALK_SOURCE_IDS,
    Sector,
    get_sector_taxonomy,
)

MatchKind = Literal["exact"]
Confidence = Literal["exact", "ambiguous"]

_NO_EQUIVALENT_RE = re.compile(r"^\(\s*no direct equivalent\s*\)$", re.IGNORECASE)
_INCLUDED_IN_RE = re.compile(r"^\(\s*included in\s+(.+?)\s*\)$", re.IGNORECASE)
_COVERED_UNDER_RE = re.compile(r"^\(\s*covered under\s+(.+?)\s*\)$", re.IGNORECASE)
# Drop trailing taxonomy-parent notes like "Formation (Services aux entreprises)"
# when building extra match keys — keep the full string as the primary alias.
_TRAILING_PAREN_RE = re.compile(r"\s*\([^)]*\)\s*$")


@dataclass(frozen=True)
class CrosswalkAlias:
    """One searchable source-directory term pointing at a wev sector."""

    sector_id: str
    source: str
    raw_term: str
    normalized: str
    kind: MatchKind = "exact"


@dataclass(frozen=True)
class CrosswalkMatch:
    """Result of resolving a scraped/source category string."""

    sector_id: str
    source: str
    matched_term: str
    confidence: Confidence


def normalize_crosswalk_term(term: str | None) -> str:
    """Lowercase, strip accents/punctuation, collapse whitespace for matching."""
    if not term:
        return ""
    text = unicodedata.normalize("NFKD", str(term))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("&", " and ")
    text = text.lower()
    text = re.sub(r"[^\w\s]+", " ", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_crosswalk_cell(raw: str | None) -> list[str]:
    """Extract reverse-lookup aliases from one MASTER-sheet crosswalk cell.

    Returns an empty list for soft / non-equivalent cells. Splits ``;``-separated
    exact terms. Keeps parenthetical notes on the primary form and also indexes
    the bare head when a trailing ``(…)`` note is present.
    """
    if raw is None:
        return []
    cell = str(raw).strip()
    if not cell:
        return []
    if _NO_EQUIVALENT_RE.match(cell):
        return []
    if _INCLUDED_IN_RE.match(cell) or _COVERED_UNDER_RE.match(cell):
        return []

    aliases: list[str] = []
    seen: set[str] = set()
    for part in cell.split(";"):
        term = part.strip()
        if not term or _NO_EQUIVALENT_RE.match(term):
            continue
        if _INCLUDED_IN_RE.match(term) or _COVERED_UNDER_RE.match(term):
            continue
        candidates = [term]
        bare = _TRAILING_PAREN_RE.sub("", term).strip()
        if bare and bare.lower() != term.lower():
            candidates.append(bare)
        for candidate in candidates:
            key = normalize_crosswalk_term(candidate)
            if not key or key in seen:
                continue
            seen.add(key)
            aliases.append(candidate)
    return aliases


@lru_cache(maxsize=1)
def get_crosswalk_aliases() -> tuple[CrosswalkAlias, ...]:
    """All exact reverse aliases derived from the shared taxonomy crosswalk."""
    rows: list[CrosswalkAlias] = []
    for sector in get_sector_taxonomy():
        for source in CROSSWALK_SOURCE_IDS:
            raw_cell = (sector.term_crosswalk or {}).get(source)
            for term in parse_crosswalk_cell(raw_cell):
                rows.append(
                    CrosswalkAlias(
                        sector_id=sector.id,
                        source=source,
                        raw_term=term,
                        normalized=normalize_crosswalk_term(term),
                    )
                )
    return tuple(rows)


@lru_cache(maxsize=1)
def get_crosswalk_index() -> dict[str, tuple[CrosswalkAlias, ...]]:
    """Map normalized term → aliases (may span multiple sectors/sources)."""
    index: dict[str, list[CrosswalkAlias]] = {}
    for alias in get_crosswalk_aliases():
        index.setdefault(alias.normalized, []).append(alias)
    return {key: tuple(vals) for key, vals in index.items()}


def resolve_crosswalk_matches(
    term: str | None,
    *,
    source: str | None = None,
) -> list[CrosswalkMatch]:
    """Resolve a source category string to zero or more sector matches.

    When ``source`` is set, only aliases from that directory vocabulary are
    considered. Duplicate sector hits collapse to one match. If more than one
    sector remains, each match is marked ``ambiguous``.
    """
    key = normalize_crosswalk_term(term)
    if not key:
        return []

    aliases = get_crosswalk_index().get(key, ())
    if source:
        source_key = source.strip().lower()
        aliases = tuple(a for a in aliases if a.source == source_key)

    by_sector: dict[str, CrosswalkAlias] = {}
    for alias in aliases:
        by_sector.setdefault(alias.sector_id, alias)

    confidence: Confidence = "exact" if len(by_sector) == 1 else "ambiguous"
    return [
        CrosswalkMatch(
            sector_id=alias.sector_id,
            source=alias.source,
            matched_term=alias.raw_term,
            confidence=confidence,
        )
        for alias in by_sector.values()
    ]


def resolve_sector_from_crosswalk(
    term: str | None,
    *,
    source: str | None = None,
) -> str | None:
    """Return the unique ``sector_id`` for a source term, or None if none/ambiguous."""
    matches = resolve_crosswalk_matches(term, source=source)
    if len(matches) != 1 or matches[0].confidence != "exact":
        return None
    return matches[0].sector_id


def format_crosswalk_aliases_for_sector(sector: Sector) -> str:
    """Human-readable source aliases for one sector (LLM prompt line)."""
    parts: list[str] = []
    for source in CROSSWALK_SOURCE_IDS:
        aliases = parse_crosswalk_cell((sector.term_crosswalk or {}).get(source))
        if not aliases:
            continue
        label = {
            "cmc": "CMC",
            "chantier": "Chantier",
            "ccednet_buy_social": "CCEDNet/Buy Social",
            "ripess": "RIPESS",
        }.get(source, source)
        parts.append(f"{label}: {'; '.join(aliases)}")
    return "; ".join(parts)


def build_source_categories_payload(
    categories: list[str] | tuple[str, ...] | str | None,
    *,
    vocab: str | None = None,
) -> dict[str, Any]:
    """Structure scraped source categories for ``jobs.extra`` / org metadata.

    Resolves each raw term through the crosswalk when possible. Unique hits are
    listed under ``resolved_sector_ids``; collisions stay in ``ambiguous_terms``
    for LLM follow-up.
    """
    if categories is None:
        raw_list: list[str] = []
    elif isinstance(categories, str):
        raw_list = [categories.strip()] if categories.strip() else []
    else:
        raw_list = [str(c).strip() for c in categories if str(c).strip()]

    resolved: list[str] = []
    ambiguous: list[dict[str, Any]] = []
    unresolved: list[str] = []
    seen_sectors: set[str] = set()

    for raw in raw_list:
        matches = resolve_crosswalk_matches(raw, source=vocab)
        sector_ids = [m.sector_id for m in matches]
        if len(sector_ids) == 1:
            sid = sector_ids[0]
            if sid not in seen_sectors:
                seen_sectors.add(sid)
                resolved.append(sid)
        elif len(sector_ids) > 1:
            ambiguous.append({"term": raw, "sector_ids": sector_ids})
        else:
            unresolved.append(raw)

    payload: dict[str, Any] = {
        "raw": raw_list,
        "resolved_sector_ids": resolved,
        "ambiguous_terms": ambiguous,
        "unresolved_terms": unresolved,
    }
    if vocab:
        payload["vocab"] = vocab
    return payload


def merge_source_categories_into_extra(
    extra: dict[str, Any] | None,
    categories: list[str] | tuple[str, ...] | str | None,
    *,
    vocab: str | None = None,
) -> dict[str, Any]:
    """Return a copy of ``extra`` with ``source_categories`` populated."""
    base = dict(extra) if isinstance(extra, dict) else {}
    base["source_categories"] = build_source_categories_payload(
        categories, vocab=vocab
    )
    return base
