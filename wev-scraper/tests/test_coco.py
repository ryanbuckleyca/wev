from unittest.mock import patch

import pytest

from conftest import make_source
from scrapers.base import BaseScraper
from scrapers.coco import CocoScraper


def test_coco_start_browser_disables_proxy():
    scraper = CocoScraper(make_source(url="https://coco-net.org/job-postings/", name="COCO"))

    with patch.object(BaseScraper, "start_browser", return_value="page") as mock_start:
        page = scraper.start_browser()

    assert page == "page"
    mock_start.assert_called_once_with(headless=True, viewport=None, use_proxy=False)


def test_is_error_page_detects_sgcaptcha(page):
    page.set_content(
        '<html><head><meta http-equiv="refresh" '
        'content="0;/.well-known/sgcaptcha/?r=%2Fjob-postings%2F"></head></html>'
    )
    page.goto("data:text/html,<html></html>")
    page.set_content(
        '<html><head><meta http-equiv="refresh" '
        'content="0;/.well-known/sgcaptcha/?r=%2Fjob-postings%2F"></head></html>'
    )

    scraper = BaseScraper(make_source(url="https://coco-net.org/job-postings/", name="COCO"))
    with pytest.raises(Exception, match="Bot challenge"):
        scraper._is_error_page(page)
