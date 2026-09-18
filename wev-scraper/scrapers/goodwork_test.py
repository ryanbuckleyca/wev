import pytest
from scrapers.goodwork import GoodWorkScraper

def make_source():
    return {"id": "test", "url": "https://www.goodwork.ca", "name": "GoodWork"}


def test_get_listings_url():
    scraper = GoodWorkScraper(make_source())
    assert scraper.get_listings_url() == "https://www.goodwork.ca/jobs.php"


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


def test_extract_job_title_prefers_job_title_over_campaign_h2(page):
    """Campaign H2s like 'Vancouver bikes, Vancouver jobs' must not win."""
    scraper = GoodWorkScraper(make_source())
    page.set_content("""
        <div id="page">
            <h2>Vancouver bikes, Vancouver jobs</h2>
            <div class="row">
                <div>
                    <p><strong>Job Title:</strong> Bike Valet Attendant</p>
                    <p><strong>Project:</strong> The Bike Valet</p>
                    <p><strong>Organization:</strong> Better Environmentally Sound Transportation</p>
                </div>
            </div>
        </div>
    """)
    assert scraper.extract_job_title(page, {}) == "Bike Valet Attendant"


def test_extract_job_title_uses_positions_label_not_category_h2(page):
    scraper = GoodWorkScraper(make_source())
    page.set_content("""
        <div id="page">
            <h2>Eco-Landscaping, Horticulture & Gardener Jobs</h2>
            <div class="row">
                <div>
                    <p><strong>Positions:</strong> Maintenance Technician</p>
                    <p><strong>Company:</strong> Ginkgo Sustainability Inc.</p>
                </div>
            </div>
        </div>
    """)
    assert scraper.extract_job_title(page, {}) == "Maintenance Technician"


def test_extract_job_title_skips_category_h2_without_label(page):
    scraper = GoodWorkScraper(make_source())
    page.set_content("""
        <div id="page">
            <h2>Summer jobs, Student jobs</h2>
            <div class="row"><div>No labeled title here.</div></div>
        </div>
    """)
    assert scraper.extract_job_title(page, {}) == "Unknown"


def test_extract_job_title_skips_list_category_h2_with_role_word(page):
    """List-style category crumb with a role word ('Gardener') is still a category."""
    scraper = GoodWorkScraper(make_source())
    page.set_content("""
        <div id="page">
            <h2>Eco-Landscaping, Horticulture & Gardener Jobs</h2>
            <div class="row"><div>No labeled title here.</div></div>
        </div>
    """)
    assert scraper.extract_job_title(page, {}) == "Unknown"

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
