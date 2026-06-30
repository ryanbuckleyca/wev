import re
from typing import Dict, Type

from scrapers.centraide import CentraideScraper
from scrapers.charityvillage import CharityVillageScraper
from scrapers.coco import CocoScraper
from scrapers.csi import CSIScraper
from scrapers.cwc import CWCScraper
from scrapers.ecocanada import EcoCanadaScraper
from scrapers.goodwork import GoodWorkScraper
from scrapers.macommunaute import MaCommunauteScraper
from scrapers.workinculture import WorkInCultureScraper

# Canonical slug → scraper class.
SCRAPER_MAP: Dict[str, Type] = {
    "ecocan": EcoCanadaScraper,
    "goodwork": GoodWorkScraper,
    "coco": CocoScraper,
    "csi": CSIScraper,
    "cent": CentraideScraper,
    "mac": MaCommunauteScraper,
    "macb": MaCommunauteScraper,
    "charityvillage": CharityVillageScraper,
    "cwc": CWCScraper,
    "workinculture": WorkInCultureScraper,
}

# Pre-migration slug values (local DBs, branches not yet migrated).
LEGACY_SLUG_ALIASES: Dict[str, str] = {
    "ecocanada": "ecocan",
    "centraide": "cent",
    "ma_communaute": "mac",
    "ma_communaute_b": "macb",
}

# Production source UUIDs — stable until prod has slug column populated.
PROD_SOURCE_CANONICAL_SLUG: Dict[str, str] = {
    "eb5a9e52-b626-4539-8539-981240f2dbee": "ecocan",
    "d644049f-7186-4b7e-8860-adf69a4bd927": "goodwork",
    "4bbc9bac-76ae-4b2e-bd4e-ac67f739ac2a": "coco",
    "a7154a94-7c95-442f-811a-12f9a62e5332": "csi",
    "c068cbc6-90a5-45cb-95a1-a7281dd76198": "cent",
    "01a58f5e-f47c-4310-a2d1-6627a57e2071": "mac",
    "394fd635-bf74-463a-9e74-b17405a8b688": "macb",
}

PROD_SOURCE_ID_MAP: Dict[str, Type] = {
    source_id: SCRAPER_MAP[slug]
    for source_id, slug in PROD_SOURCE_CANONICAL_SLUG.items()
}

# Name fallback for local seeds (different UUIDs, varying display names).
SOURCE_NAME_TO_SLUG: Dict[str, str] = {
    "eco canada": "ecocan",
    "goodwork": "goodwork",
    "coco": "coco",
    "centre for social innovation": "csi",
    "centraide": "cent",
    "ma communauté emplois": "mac",
    "ma communauté bénévolat": "macb",
    "ma communauté (emplois)": "mac",
    "ma communauté (bénévolat)": "macb",
    "charity village": "charityvillage",
    "charityvillage": "charityvillage",
    "canadian worker co-op federation": "cwc",
    "cwc": "cwc",
    "work in culture": "workinculture",
    "workinculture": "workinculture",
}

SCRAPER_NAME_MAP: Dict[str, Type] = {
    name: SCRAPER_MAP[slug] for name, slug in SOURCE_NAME_TO_SLUG.items()
}


def _normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def canonical_slug(slug: str) -> str:
    return LEGACY_SLUG_ALIASES.get(slug, slug)


def _scraper_for_slug(slug: str) -> Type | None:
    return SCRAPER_MAP.get(canonical_slug(slug))


def source_canonical_slug(source: dict) -> str | None:
    """Resolve a source row to its canonical slug, if known."""
    slug = source.get("slug")
    if slug:
        canon = canonical_slug(slug)
        if canon in SCRAPER_MAP:
            return canon

    source_id = source.get("id")
    if source_id:
        canon = PROD_SOURCE_CANONICAL_SLUG.get(source_id)
        if canon:
            return canon

    name = source.get("name")
    if name:
        return SOURCE_NAME_TO_SLUG.get(_normalize_name(name))

    return None


def source_matches_slug(source: dict, requested: str) -> bool:
    """True when a source row matches a --source/--slug filter."""
    requested_canon = canonical_slug(requested)
    if requested_canon not in SCRAPER_MAP:
        return source.get("slug") == requested

    source_canon = source_canonical_slug(source)
    return source_canon == requested_canon


def get_scraper_class(source: dict) -> Type | None:
    """Resolve scraper for a sources row (slug → prod UUID → name)."""
    slug = source.get("slug") or ""
    if slug:
        cls = _scraper_for_slug(slug)
        if cls is not None:
            return cls

    source_id = source.get("id") or ""
    if source_id:
        cls = PROD_SOURCE_ID_MAP.get(source_id)
        if cls is not None:
            return cls

    name = source.get("name")
    if name:
        return SCRAPER_NAME_MAP.get(_normalize_name(name))

    return None


def get_all_registered_source_slugs() -> list[str]:
    """Return canonical slugs that have a registered scraper."""
    return list(SCRAPER_MAP.keys())
