from scrapers.ecocanada import EcoCanadaScraper
from scrapers.goodwork import GoodWorkScraper
from scrapers.macommunaute import MaCommunauteScraper
from scrapers.registry import get_scraper_class


def test_get_scraper_class_by_canonical_slug():
    assert get_scraper_class({"slug": "ecocan"}) is EcoCanadaScraper


def test_get_scraper_class_by_legacy_slug():
    assert get_scraper_class({"slug": "ecocanada"}) is EcoCanadaScraper


def test_get_scraper_class_by_prod_uuid_when_slug_missing():
    assert (
        get_scraper_class(
            {
                "id": "d644049f-7186-4b7e-8860-adf69a4bd927",
                "name": "GoodWork",
            }
        )
        is GoodWorkScraper
    )


def test_get_scraper_class_by_prod_display_name():
    assert (
        get_scraper_class(
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "name": "Ma Communauté (emplois)",
            }
        )
        is MaCommunauteScraper
    )


def test_get_scraper_class_unknown_source():
    assert get_scraper_class({"slug": "unknown", "name": "Unknown"}) is None
