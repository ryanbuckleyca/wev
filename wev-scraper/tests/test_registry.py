from scrapers.chantier import ChantierScraper
from scrapers.cooperationcanada import CooperationCanadaScraper
from scrapers.ecocanada import EcoCanadaScraper
from scrapers.goodwork import GoodWorkScraper
from scrapers.idealist import IdealistScraper
from scrapers.macommunaute import MaCommunauteScraper
from scrapers.registry import (
    canonical_slug,
    get_scraper_class,
    source_canonical_slug,
    source_matches_slug,
)
from scrapers.winp import WinpScraper


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


def test_get_scraper_class_winp_boards():
    assert get_scraper_class({"slug": "winpvol"}) is WinpScraper
    assert get_scraper_class({"name": "WorkInNonProfits Volunteer"}) is WinpScraper
    assert get_scraper_class({"slug": "winpjobs"}) is WinpScraper
    assert get_scraper_class({"name": "WorkInNonProfits Jobs"}) is WinpScraper


def test_get_scraper_class_idealist_boards():
    assert get_scraper_class({"slug": "idealist"}) is IdealistScraper
    assert get_scraper_class({"name": "Idealist Jobs"}) is IdealistScraper
    assert get_scraper_class({"slug": "idealistintern"}) is IdealistScraper
    assert get_scraper_class({"name": "Idealist Internships"}) is IdealistScraper


def test_get_scraper_class_cooperation_canada():
    assert get_scraper_class({"slug": "coopcan"}) is CooperationCanadaScraper
    assert get_scraper_class({"name": "Cooperation Canada"}) is CooperationCanadaScraper


def test_get_scraper_class_chantier():
    assert get_scraper_class({"slug": "chantier"}) is ChantierScraper
    assert (
        get_scraper_class({"name": "Chantier de l'économie sociale"}) is ChantierScraper
    )


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
