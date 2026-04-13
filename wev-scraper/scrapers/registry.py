from typing import Type, Dict
from scrapers.ecocanada import EcoCanadaScraper
from scrapers.goodwork import GoodWorkScraper
from scrapers.coco import CocoScraper
from scrapers.csi import CSIScraper
from scrapers.centraide import CentraideScraper
from scrapers.macommunaute import MaCommunauteScraper

# Mapping of Supabase Source IDs to Scraper Classes
SCRAPER_MAP: Dict[str, Type] = {
    "eb5a9e52-b626-4539-8539-981240f2dbee": EcoCanadaScraper,
    "d644049f-7186-4b7e-8860-adf69a4bd927": GoodWorkScraper,
    "4bbc9bac-76ae-4b2e-bd4e-ac67f739ac2a": CocoScraper,
    "a7154a94-7c95-442f-811a-12f9a62e5332": CSIScraper,
    "c068cbc6-90a5-45cb-95a1-a7281dd76198": CentraideScraper,
    "01a58f5e-f47c-4310-a2d1-6627a57e2071": MaCommunauteScraper,
    "394fd635-bf74-463a-9e74-b17405a8b688": MaCommunauteScraper,
}

def get_scraper_class(source_id: str) -> Type | None:
    """Return the scraper class for a given Supabase source ID."""
    return SCRAPER_MAP.get(source_id)

def get_all_registered_source_ids() -> list[str]:
    """Return a list of all source IDs that have a registered scraper."""
    return list(SCRAPER_MAP.keys())
