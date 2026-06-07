import pytest
from scrapers.goodwork import GoodWorkScraper

def make_source():
    return {"id": "test", "url": "https://www.goodwork.ca", "name": "GoodWork"}

def test_extract_job_title(page):
    scraper = GoodWorkScraper(make_source())
    # GoodWork looks for <p><strong>Position:</strong> ...</p>
    page.set_content("""
        <div id="page">
            <div class="row">
                <div>
                    <p><strong>Position:</strong> Senior Developer</p>
                </div>
            </div>
        </div>
    """)
    title = scraper.extract_job_title(page, {})
    assert title == "Senior Developer"

def test_extract_organization(page):
    scraper = GoodWorkScraper(make_source())
    page.set_content("""
        <div id="page">
            <div class="row">
                <div>
                    <p><strong>Organization:</strong> Green Peace</p>
                </div>
            </div>
        </div>
    """)
    org = scraper.extract_organization(page, {})
    assert org == "Green Peace"

def test_extract_location(page):
    scraper = GoodWorkScraper(make_source())
    page.set_content("""
        <div id="page">
            <div class="row">
                <div>
                    <p><strong>Location:</strong> Toronto, ON</p>
                </div>
            </div>
        </div>
    """)
    loc = scraper.extract_location(page, {})
    assert loc == "Toronto, ON"

def test_extract_date_posted(page):
    scraper = GoodWorkScraper(make_source())
    # GoodWork uses DATE_POSTED_PATTERN = re.compile(r"Date posted:\s*([A-Za-z]{3}\s+\d{1,2}\s+\d{4})", re.IGNORECASE)
    page.set_content("""
        <div id="page">
            <div class="row">
                <div>
                    Date posted: Jan 1 2024
                </div>
            </div>
        </div>
    """)
    date = scraper.extract_date_posted(page, {})
    assert date == "Jan 1 2024"

def test_extract_wage(page):
    scraper = GoodWorkScraper(make_source())
    page.set_content("""
        <div id="page">
            <div class="row">
                <div>
                    <p><strong>Wage:</strong> $50,000 per year</p>
                </div>
            </div>
        </div>
    """)
    wage = scraper.extract_wage(page, {})
    assert "$50,000" in wage
