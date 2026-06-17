from scrapers.ecocanada import EcoCanadaScraper
from scrapers.goodwork import GoodWorkScraper
from scrapers.macommunaute import MaCommunauteScraper
from scrapers.registry import (
    canonical_slug,
    get_scraper_class,
    source_canonical_slug,
    source_matches_slug,
)


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


def test_source_matches_slug_by_legacy_slug():
    source = {"slug": "ma_communaute", "name": "Ma Communauté (emplois)"}
    assert source_matches_slug(source, "mac") is True
    assert source_matches_slug(source, "macb") is False


def test_source_matches_slug_by_prod_uuid():
    source = {
        "id": "01a58f5e-f47c-4310-a2d1-6627a57e2071",
        "name": "Ma Communauté (emplois)",
    }
    assert source_matches_slug(source, "mac") is True
    assert source_canonical_slug(source) == "mac"


def test_canonical_slug_aliases():
    assert canonical_slug("ma_communaute") == "mac"
    assert canonical_slug("mac") == "mac"
