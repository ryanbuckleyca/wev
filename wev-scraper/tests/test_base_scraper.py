from unittest.mock import MagicMock, patch

import pytest

from scrapers.base import BaseScraper, _get_stealth, _is_ci


def test_is_ci():
    with patch.dict("os.environ", {"GITHUB_ACTIONS": "true"}):
        assert _is_ci() is True
    with patch.dict("os.environ", {"GITHUB_ACTIONS": "false"}):
        assert _is_ci() is False

def test_parse_int_env():
    with patch.dict("os.environ", {"TEST_VAR": "123"}):
        assert BaseScraper._parse_int_env("TEST_VAR") == 123
    with patch.dict("os.environ", {"TEST_VAR": "abc"}):
        assert BaseScraper._parse_int_env("TEST_VAR") is None
    assert BaseScraper._parse_int_env("MISSING") is None

def test_retry_success():
    scraper = BaseScraper({"url": "http://example.com"})
    mock_func = MagicMock(return_value="success")
    res = scraper._retry(mock_func)
    assert res == "success"
    assert mock_func.call_count == 1

def test_retry_eventual_success():
    scraper = BaseScraper({"url": "http://example.com"})
    mock_func = MagicMock(side_effect=[Exception("fail"), "success"])
    res = scraper._retry(mock_func)
    assert res == "success"
    assert mock_func.call_count == 2

def test_retry_fail_403_non_ci():
    scraper = BaseScraper({"url": "http://example.com"})
    mock_func = MagicMock(side_effect=Exception("403 forbidden"))
    with patch("scrapers.base._is_ci", return_value=False):
        with pytest.raises(Exception) as e:
            scraper._retry(mock_func)
        assert "403 forbidden" in str(e.value)
        assert mock_func.call_count == 1

def test_get_stealth():
    # Test lazy init
    with patch("playwright_stealth.Stealth") as mock_stealth:
        _get_stealth()
        mock_stealth.assert_called_once()
        _get_stealth()
        # Should not call again
        mock_stealth.assert_called_once()

@patch("scrapers.base.sync_playwright")
def test_setup_browser(mock_playwright):
    scraper = BaseScraper({"url": "http://test.com"})
    mock_browser = mock_playwright.return_value.chromium.launch.return_value
    mock_context = mock_browser.new_context.return_value

    scraper.setup_browser(headed=True)

    mock_playwright.return_value.chromium.launch.assert_called_once_with(headless=False)
    assert scraper.browser == mock_browser
    assert scraper.context == mock_context

def test_close_browser():
    scraper = BaseScraper({"url": "http://test.com"})
    scraper.browser = MagicMock()
    scraper.playwright = MagicMock()

    scraper.close_browser()

    scraper.browser.close.assert_called_once()
    scraper.playwright.stop.assert_called_once()
    assert scraper.browser is None

@patch("scrapers.base._get_stealth")
def test_stealth_applied(mock_stealth):
    scraper = BaseScraper({"url": "http://test.com"})
    mock_page = MagicMock()
    scraper._apply_stealth(mock_page)
    mock_stealth.return_value.apply.assert_called_once_with(mock_page)

def test_block_heavy_resources():
    scraper = BaseScraper({"url": "http://test.com"})
    mock_route = MagicMock()

    # Image request
    mock_request = MagicMock(resource_type="image")
    scraper._block_heavy_resources(mock_route, mock_request)
    mock_route.abort.assert_called_once()

    # Document request
    mock_route.abort.reset_mock()
    mock_request.resource_type = "document"
    scraper._block_heavy_resources(mock_route, mock_request)
    mock_route.continue_.assert_called_once()

def test_safe_get_text():
    scraper = BaseScraper({"url": "http://test.com"})
    mock_element = MagicMock()
    mock_element.inner_text.return_value = "  Some text  "
    assert scraper._safe_get_text(mock_element) == "Some text"

    mock_element.inner_text.side_effect = Exception("error")
    assert scraper._safe_get_text(mock_element) == ""
    assert scraper._safe_get_text(None) == ""

def test_clean_text():
    scraper = BaseScraper({"url": "http://test.com"})
    assert scraper._clean_text("line1\n\nline2\rline3") == "line1\nline2\nline3"
    assert scraper._clean_text(None) == ""

def test_base_scraper_hooks():
    source = {"url": "http://test.com", "id": "1"}
    scraper = BaseScraper(source)
    assert scraper.get_listings_url() == "http://test.com"
    assert scraper.get_filter_values() == [None]
