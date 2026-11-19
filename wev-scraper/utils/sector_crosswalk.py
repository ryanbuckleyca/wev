"""Reverse-lookup vocabulary for the SSE sector taxonomy crosswalk (v2.5).

Indexes preferred labels + MASTER-sheet aliases so scraped source categories
and LLM prompts share one vocabulary. Facet matches (role / population /
employer type) are returned separately — they are not industry sectors.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal

from utils.sector_prompts import (
    Sector,
    get_crosswalk_source_ids,
    get_sector_facets,
    get_sector_taxonomy,
)

Confidence = Literal["exact", "ambiguous"]
MatchKind = Literal["sector", "facet"]


@dataclass(frozen=True)
class CrosswalkAlias:
    entry_id: str
    kind: MatchKind
    source: str | None
    raw_term: str
    normalized: str


@dataclass(frozen=True)
class CrosswalkMatch:
    entry_id: str
    kind: MatchKind
    source: str | None
    matched_term: str
    confidence: Confidence

    @property
    def sector_id(self) -> str | None:
        return self.entry_id if self.kind == "sector" else None

    @property
    def facet_id(self) -> str | None:
        return self.entry_id if self.kind == "facet" else None


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


def _global_aliases_for_entry(entry: Sector) -> list[str]:
    """Preferred labels + curated aliases only (unscoped / global).

    Workbook source cells are NOT promoted here — they are indexed with their
    source key so CMC-only wording cannot match a GoodWork lookup.
    """
    aliases = [entry.label_en, entry.label_fr, *(entry.aliases or [])]
    seen: set[str] = set()
    out: list[str] = []
    for alias in aliases:
        key = normalize_crosswalk_term(alias)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(alias)
    return out


def _strip_source_cell(raw: str) -> str:
    text = re.sub(r"^[^:]+:\s*", "", str(raw)).strip()
    return re.sub(r"\s+(jobs|tags)$", "", text, flags=re.I).strip()


@lru_cache(maxsize=1)
def get_crosswalk_aliases() -> tuple[CrosswalkAlias, ...]:
    rows: list[CrosswalkAlias] = []
    for entry, kind in (
        *((s, "sector") for s in get_sector_taxonomy()),
        *((f, "facet") for f in get_sector_facets()),
    ):
        for term in _global_aliases_for_entry(entry):
            rows.append(
                CrosswalkAlias(
                    entry_id=entry.id,
                    kind=kind,  # type: ignore[arg-type]
                    source=None,
                    raw_term=term,
                    normalized=normalize_crosswalk_term(term),
                )
            )
        for source, raw in (entry.term_crosswalk or {}).items():
            if not raw:
                continue
            text = _strip_source_cell(str(raw))
            if not text:
                continue
            rows.append(
                CrosswalkAlias(
                    entry_id=entry.id,
                    kind=kind,  # type: ignore[arg-type]
                    source=source,
                    raw_term=text,
                    normalized=normalize_crosswalk_term(text),
                )
            )
    return tuple(rows)


@lru_cache(maxsize=1)
def get_crosswalk_index() -> dict[str, tuple[CrosswalkAlias, ...]]:
    index: dict[str, list[CrosswalkAlias]] = {}
    for alias in get_crosswalk_aliases():
        index.setdefault(alias.normalized, []).append(alias)
    return {key: tuple(vals) for key, vals in index.items()}


def _candidate_keys(term: str | None) -> list[str]:
    """Normalize raw + stripped board-prefixed variants for lookup."""
    if not term:
        return []
    raw = str(term).strip()
    variants = [raw]
    stripped = re.sub(r"^[^:]+:\s*", "", raw).strip()
    stripped = re.sub(r"\s+(jobs|tags)$", "", stripped, flags=re.I).strip()
    if stripped and stripped not in variants:
        variants.append(stripped)
    keys: list[str] = []
    seen: set[str] = set()
    for variant in variants:
        key = normalize_crosswalk_term(variant)
        if key and key not in seen:
            seen.add(key)
            keys.append(key)
    return keys


def resolve_crosswalk_matches(
    term: str | None,
    *,
    source: str | None = None,
    include_facets: bool = True,
) -> list[CrosswalkMatch]:
    """Resolve a source category string to zero or more taxonomy matches."""
    keys = _candidate_keys(term)
    if not keys:
        return []

    index = get_crosswalk_index()
    aliases: list[CrosswalkAlias] = []
    seen_alias_ids: set[tuple[str, str, str | None, str]] = set()
    for key in keys:
        for alias in index.get(key, ()):
            ident = (alias.kind, alias.entry_id, alias.source, alias.normalized)
            if ident in seen_alias_ids:
                continue
            seen_alias_ids.add(ident)
            aliases.append(alias)
    if source:
        source_key = source.strip().lower()
        aliases = [
            a for a in aliases if a.source is None or a.source == source_key
        ]
    if not include_facets:
        aliases = [a for a in aliases if a.kind == "sector"]

    by_entry: dict[tuple[str, str], CrosswalkAlias] = {}
    for alias in aliases:
        by_entry.setdefault((alias.kind, alias.entry_id), alias)

    confidence: Confidence = "exact" if len(by_entry) == 1 else "ambiguous"
    return [
        CrosswalkMatch(
            entry_id=alias.entry_id,
            kind=alias.kind,
            source=alias.source,
            matched_term=alias.raw_term,
            confidence=confidence,
        )
        for alias in by_entry.values()
    ]


def resolve_sector_from_crosswalk(
    term: str | None,
    *,
    source: str | None = None,
) -> str | None:
    """Return the unique industry sector id for a term, else None."""
    matches = [
        m
        for m in resolve_crosswalk_matches(term, source=source, include_facets=False)
        if m.kind == "sector"
    ]
    if len(matches) != 1 or matches[0].confidence != "exact":
        # If filtering left multiple sector aliases that collapsed wrongly:
        sector_ids = {m.entry_id for m in matches}
        if len(sector_ids) == 1:
            return next(iter(sector_ids))
        return None
    return matches[0].entry_id


def format_crosswalk_aliases_for_sector(sector: Sector) -> str:
    """Compact source-alias line for LLM prompts."""
    preferred = [sector.label_en, sector.label_fr]
    # Highlight a few scraped-board labels when they differ
    extras: list[str] = []
    for key in ("charityvillage", "idealist", "goodwork", "chantier", "cmc", "ccednet"):
        raw = (sector.term_crosswalk or {}).get(key)
        if not raw:
            continue
        text = re.sub(r"^[^:]+:\s*", "", str(raw)).strip()
        text = re.sub(r"\s+(jobs|tags)$", "", text, flags=re.I).strip()
        if text and text not in preferred and text not in extras:
            extras.append(text)
    parts = preferred + extras[:4]
    return "; ".join(parts)


def build_source_categories_payload(
    categories: list[str] | tuple[str, ...] | str | None,
    *,
    vocab: str | None = None,
) -> dict[str, Any]:
    """Structure scraped source categories for jobs.extra / org metadata."""
    if categories is None:
        raw_list: list[str] = []
    elif isinstance(categories, str):
        raw_list = [categories.strip()] if categories.strip() else []
    else:
        raw_list = [str(c).strip() for c in categories if str(c).strip()]

    resolved: list[str] = []
    facet_ids: list[str] = []
    ambiguous: list[dict[str, Any]] = []
    unresolved: list[str] = []
    seen_sectors: set[str] = set()
    seen_facets: set[str] = set()

    for raw in raw_list:
        matches = resolve_crosswalk_matches(raw, source=vocab, include_facets=True)
        sector_ids = [m.entry_id for m in matches if m.kind == "sector"]
        facet_hits = [m.entry_id for m in matches if m.kind == "facet"]
        # Dedup while preserving order
        sector_ids = list(dict.fromkeys(sector_ids))
        facet_hits = list(dict.fromkeys(facet_hits))

        if len(sector_ids) == 1 and not facet_hits:
            sid = sector_ids[0]
            if sid not in seen_sectors:
                seen_sectors.add(sid)
                resolved.append(sid)
        elif len(facet_hits) == 1 and not sector_ids:
            fid = facet_hits[0]
            if fid not in seen_facets:
                seen_facets.add(fid)
                facet_ids.append(fid)
        elif sector_ids or facet_hits:
            ambiguous.append(
                {
                    "term": raw,
                    "sector_ids": sector_ids,
                    "facet_ids": facet_hits,
                }
            )
        else:
            unresolved.append(raw)

    payload: dict[str, Any] = {
        "raw": raw_list,
        "resolved_sector_ids": resolved,
        "facet_ids": facet_ids,
        "ambiguous_terms": ambiguous,
        "unresolved_terms": unresolved,
    }
    if vocab:
        payload["vocab"] = vocab
    # Expose known source keys for callers/tests
    payload["known_sources"] = list(get_crosswalk_source_ids())
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


# Back-compat: old soft-cell parser no longer applies to v2.5 synthetic cells.
def parse_crosswalk_cell(raw: str | None) -> list[str]:
    """Return searchable aliases from a MASTER source cell."""
    if not raw:
        return []
    text = re.sub(r"^[^:]+:\s*", "", str(raw)).strip()
    text = re.sub(r"\s+(jobs|tags)$", "", text, flags=re.I).strip()
    return [text] if text else []
