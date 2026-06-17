import re
from typing import Dict, Type

from scrapers.centraide import CentraideScraper
from scrapers.coco import CocoScraper
from scrapers.csi import CSIScraper
from scrapers.ecocanada import EcoCanadaScraper
from scrapers.goodwork import GoodWorkScraper
from scrapers.macommunaute import MaCommunauteScraper

# Canonical slug → scraper class.
SCRAPER_MAP: Dict[str, Type] = {
    "ecocan": EcoCanadaScraper,
    "goodwork": GoodWorkScraper,
    "coco": CocoScraper,
    "csi": CSIScraper,
    "cent": CentraideScraper,
    "mac": MaCommunauteScraper,
    "macb": MaCommunauteScraper,
}

# Pre-migration slug values (local DBs, branches not yet migrated).
LEGACY_SLUG_ALIASES: Dict[str, str] = {
    "ecocanada": "ecocan",
    "centraide": "cent",
    "ma_communaute": "mac",
    "ma_communaute_b": "macb",
}

# Production source UUIDs — stable until prod has slug column populated.
PROD_SOURCE_ID_MAP: Dict[str, Type] = {
    "eb5a9e52-b626-4539-8539-981240f2dbee": EcoCanadaScraper,
    "d644049f-7186-4b7e-8860-adf69a4bd927": GoodWorkScraper,
    "4bbc9bac-76ae-4b2e-bd4e-ac67f739ac2a": CocoScraper,
    "a7154a94-7c95-442f-811a-12f9a62e5332": CSIScraper,
    "c068cbc6-90a5-45cb-95a1-a7281dd76198": CentraideScraper,
    "01a58f5e-f47c-4310-a2d1-6627a57e2071": MaCommunauteScraper,
    "394fd635-bf74-463a-9e74-b17405a8b688": MaCommunauteScraper,
}

# Name fallback for local seeds (different UUIDs, varying display names).
SCRAPER_NAME_MAP: Dict[str, Type] = {
    "eco canada": EcoCanadaScraper,
    "goodwork": GoodWorkScraper,
    "coco": CocoScraper,
    "centre for social innovation": CSIScraper,
    "centraide": CentraideScraper,
    "ma communauté emplois": MaCommunauteScraper,
    "ma communauté bénévolat": MaCommunauteScraper,
    "ma communauté (emplois)": MaCommunauteScraper,
    "ma communauté (bénévolat)": MaCommunauteScraper,
}


def _normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def _scraper_for_slug(slug: str) -> Type | None:
    canonical = LEGACY_SLUG_ALIASES.get(slug, slug)
    return SCRAPER_MAP.get(canonical)


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
