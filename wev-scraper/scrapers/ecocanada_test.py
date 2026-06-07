
from scrapers.ecocanada import EcoCanadaScraper


def make_source():
    return {"id": "ecocanada", "url": "https://eco.ca/career-hub/job-board/", "name": "ECO Canada"}

def test_get_job_url(page):
    scraper = EcoCanadaScraper(make_source())
    page.set_content("""
        <div class="acuspire-job-container">
            <h3 class="job-title-container">
                <a href="https://eco.ca/jobs/123/">Job 1</a>
            </h3>
        </div>
    """)
    item = page.locator(".acuspire-job-container").first
    url = scraper.get_job_url(item)
    assert url == "https://eco.ca/jobs/123/"

def test_extract_date_posted(page):
    scraper = EcoCanadaScraper(make_source())
    page.set_content('<span class="posted-job-time">Posted 2 days ago</span>')
    assert scraper.extract_date_posted(page, {}) == "2 days ago"

def test_extract_job_title(page):
    scraper = EcoCanadaScraper(make_source())
    page.set_content('<span class="job-title">Environmental Scientist</span>')
    assert scraper.extract_job_title(page, {}) == "Environmental Scientist"

def test_extract_location(page):
    scraper = EcoCanadaScraper(make_source())
    page.set_content("""
        <div class="job-card-summary-section">
            <div class="svg-and-text"><span>Calgary</span></div>
            <div class="svg-and-text"><span>AB</span></div>
        </div>
    """)
    assert scraper.extract_location(page, {}) == "Calgary, AB"

def test_extract_wage(page):
    scraper = EcoCanadaScraper(make_source())
    # Test primary selector
    page.set_content('<div class="wage_tag">$30 - $40 per hour</div>')
    assert scraper.extract_wage(page, {}) == "$30 - $40 per hour"
    
    # Test fallback selector
    page.set_content('<div class="salary-container">Salary: $60,000</div>')
    assert scraper.extract_wage(page, {}) == "Salary: $60,000"

def test_extract_description(page):
    scraper = EcoCanadaScraper(make_source())
    page.set_content("""
        <div class="job-description-wrapper">
            <p>Description text.</p>
            <table><tr><td>Remove me</td></tr></table>
        </div>
    """)
    desc = scraper.extract_description(page, {})
    assert "Description text." in desc
    assert "Remove me" not in desc

def test_has_next_page(page):
    scraper = EcoCanadaScraper(make_source())
    page.set_content('<div class="acuspire-pagination"><button aria-label="Next page">Next</button></div>')
    assert scraper.has_next_page(page) is True
    
    page.set_content('<div class="acuspire-pagination"></div>')
    assert scraper.has_next_page(page) is False
