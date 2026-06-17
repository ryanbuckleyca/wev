from typing import Dict, Type

from scrapers.centraide import CentraideScraper
from scrapers.coco import CocoScraper
from scrapers.csi import CSIScraper
from scrapers.ecocanada import EcoCanadaScraper
from scrapers.goodwork import GoodWorkScraper
from scrapers.macommunaute import MaCommunauteScraper

# Mapping of stable source slugs to scraper classes.
SCRAPER_MAP: Dict[str, Type] = {
    "ecocan": EcoCanadaScraper,
    "goodwork": GoodWorkScraper,
    "coco": CocoScraper,
    "csi": CSIScraper,
    "cent": CentraideScraper,
    "mac": MaCommunauteScraper,
    "macb": MaCommunauteScraper,
}


def get_scraper_class(source: dict) -> Type | None:
    """Return the scraper class for a source row using its stable slug."""
    return SCRAPER_MAP.get(source.get("slug", ""))


def get_all_registered_source_slugs() -> list[str]:
    """Return a list of all source slugs that have a registered scraper."""
    return list(SCRAPER_MAP.keys())
