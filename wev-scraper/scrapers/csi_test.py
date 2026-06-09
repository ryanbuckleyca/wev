from unittest.mock import patch

from scrapers.base import BaseScraper
from scrapers.csi import CSIScraper


def make_source():
    return {"id": "csi", "url": "https://socialinnovation.org/jobs/", "name": "CSI"}

def test_get_job_url(page):
    scraper = CSIScraper(make_source())
    page.set_content('<a href="https://socialinnovation.org/job1/">Job 1</a>')
    item = page.locator("a").first
    url = scraper.get_job_url(item)
    assert url == "https://socialinnovation.org/job1/"

    # Test duplicate URL
    assert scraper.get_job_url(item) is None

def test_get_listing_data(page):
    scraper = CSIScraper(make_source())
    page.set_content("""
        <div class="elementor-widget-wrap">
            <h4 class="elementor-heading-title"><a href="/job1/">Job 1</a></h4>
            <ul class="elementor-icon-list-items">
                <li class="elementor-icon-list-item">
                    <span class="sr-only-text">Location:</span>
                    <span class="elementor-icon-list-text">Toronto, ON</span>
                </li>
                <li class="elementor-icon-list-item">
                    <span class="sr-only-text">Contract Type:</span>
                    <span class="elementor-icon-list-text">Full-time</span>
                </li>
                <li class="elementor-icon-list-item">
                    <span class="sr-only-text">Hosted by:</span>
                    <span class="elementor-icon-list-text">CSI</span>
                </li>
            </ul>
        </div>
    """)
    item = page.locator("a").first
    data = scraper.get_listing_data(item)
    assert data["location"] == "Toronto, ON"
    assert data["employment_type"] == "Full-time"
    assert data["organization"] == "CSI"

def test_extract_job_title(page):
    scraper = CSIScraper(make_source())
    page.set_content('<h2 class="elementor-heading-title elementor-size-default">Software Engineer</h2>')
    assert scraper.extract_job_title(page, {}) == "Software Engineer"

def test_extract_wage(page):
    scraper = CSIScraper(make_source())
    page.set_content("""
        <div data-widget_type="icon-list.default">
            <li class="elementor-icon-list-item">
                <span class="elementor-icon-list-text">Compensation: $50,000 - $60,000</span>
            </li>
        </div>
    """)
    wage = scraper.extract_wage(page, {})
    assert "50,000" in wage

def test_has_next_page(page):
    scraper = CSIScraper(make_source())
    page.set_content('<button>Load More</button>')
    assert scraper.has_next_page(page) is True

    page.set_content('<div>No button</div>')
    assert scraper.has_next_page(page) is False


def test_start_browser_enables_proxy():
    scraper = CSIScraper(make_source())

    with patch.object(BaseScraper, "start_browser", return_value="page") as mock_start:
        page = scraper.start_browser()

    assert page == "page"
    mock_start.assert_called_once_with(
        headless=True,
        viewport={"width": 1280, "height": 1400},
        use_proxy=True,
    )


def test_open_listings_page_uses_stable_navigation():
    scraper = CSIScraper(make_source())

    with patch.object(BaseScraper, "open_listings_page") as mock_open:
        class StubPage:
            url = "https://socialinnovation.org/jobs/"

        page = StubPage()
        scraper.open_listings_page(page)

    mock_open.assert_called_once_with(page, None)
