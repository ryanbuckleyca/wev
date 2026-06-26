from scrapers.charityvillage import CharityVillageScraper


def make_source():
    return {"id": "test", "url": "https://www.charityvillage.com", "name": "CharityVillage"}


def test_extract_job_title(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div data-testid="title">Senior Developer</div>')
    title = scraper.extract_job_title(page, {})
    assert title == "Senior Developer"


def test_extract_job_title_falls_back_to_listing_data(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div>no title selector here</div>')
    title = scraper.extract_job_title(page, {"job_title": "Fallback Title"})
    assert title == "Fallback Title"


def test_extract_job_title_defaults_to_unknown(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div>no title selector here</div>')
    title = scraper.extract_job_title(page, {})
    assert title == "Unknown"


def test_extract_organization(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div data-testid="company-name">Charity Corp</div>')
    org = scraper.extract_organization(page, {})
    assert org == "Charity Corp"


def test_extract_organization_returns_none_when_missing(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div>no company here</div>')
    org = scraper.extract_organization(page, {})
    assert org is None


def test_extract_description(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div data-testid="job-detail-description"><p>Great job</p></div>')
    desc = scraper.extract_description(page, {})
    assert desc == "Great job"


def test_extract_location_from_listing_data(page):
    scraper = CharityVillageScraper(make_source())
    loc = scraper.extract_location(page, {"teaser_location": "Toronto, ON"})
    assert loc == "Toronto, ON"


def test_extract_location_returns_none_when_missing(page):
    scraper = CharityVillageScraper(make_source())
    loc = scraper.extract_location(page, {})
    assert loc is None


def test_extract_wage(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div data-testid="fields-values">Fundraising | Full Time | $80,000 - $90,000 per year</div>')
    wage = scraper.extract_wage(page, {})
    assert wage == "$80,000 - $90,000"


def test_extract_wage_returns_none_when_no_salary(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div data-testid="fields-values">Volunteer | No wage info</div>')
    wage = scraper.extract_wage(page, {})
    assert wage is None


def test_extract_wage_returns_none_when_missing(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div>no fields here</div>')
    wage = scraper.extract_wage(page, {})
    assert wage is None


def test_extract_employment_type(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div data-testid="fields-values">Fundraising | Full Time | $80,000 - $90,000 per year</div>')
    emp = scraper.extract_employment_type(page, {})
    assert emp == "Full Time"


def test_extract_employment_type_single_value(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div data-testid="fields-values">Volunteer</div>')
    emp = scraper.extract_employment_type(page, {})
    assert emp == "Volunteer"


def test_extract_employment_type_case_insensitive(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div data-testid="fields-values">Full-Time | Contract</div>')
    emp = scraper.extract_employment_type(page, {})
    assert emp == "Full-Time"


def test_extract_employment_type_returns_none_when_no_match(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div data-testid="fields-values">Fundraising | Category</div>')
    emp = scraper.extract_employment_type(page, {})
    assert emp is None


def test_extract_employment_type_returns_none_when_missing(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content('<div>no fields here</div>')
    emp = scraper.extract_employment_type(page, {})
    assert emp is None


def test_extract_date_posted(page):
    scraper = CharityVillageScraper(make_source())
    date = scraper.extract_date_posted(page, {"date_posted": "2024-01-15"})
    assert date == "2024-01-15"


def test_extract_close_date(page):
    scraper = CharityVillageScraper(make_source())
    date = scraper.extract_close_date(page, {"close_date": "2024-02-15"})
    assert date == "2024-02-15"


def test_get_listing_data_with_location(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content("""
        <div>
            <div data-testid="jcl-job-teaser-wrapper">
                <div data-testid="jcl-job-teaser-location">Toronto, ON</div>
            </div>
        </div>
    """)
    item = page.locator("[data-testid='jcl-job-teaser-wrapper']")
    data = scraper.get_listing_data(item)
    assert data.get("teaser_location") == "Toronto, ON"


def test_get_listing_data_with_remote_status(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content("""
        <div data-testid="jcl-job-teaser-wrapper">
            Fully Remote position
        </div>
    """)
    item = page.locator("[data-testid='jcl-job-teaser-wrapper']")
    data = scraper.get_listing_data(item)
    assert data.get("remote_status") == "Fully Remote"


def test_get_listing_data_with_hybrid_remote_status(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content("""
        <div data-testid="jcl-job-teaser-wrapper">
            Hybrid - 3 days in office
        </div>
    """)
    item = page.locator("[data-testid='jcl-job-teaser-wrapper']")
    data = scraper.get_listing_data(item)
    assert data.get("remote_status") == "Hybrid"


def test_get_listing_data_with_dates(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content("""
        <div data-testid="jcl-job-teaser-wrapper">
            Published: 2024-01-15<br/>
            Expires: 2024-02-15
        </div>
    """)
    item = page.locator("[data-testid='jcl-job-teaser-wrapper']")
    data = scraper.get_listing_data(item)
    assert data.get("date_posted") == "2024-01-15"
    assert data.get("close_date") == "2024-02-15"


def test_get_listing_data_returns_empty_dict_when_no_match(page):
    scraper = CharityVillageScraper(make_source())
    page.set_content("""
        <div data-testid="jcl-job-teaser-wrapper">
            Some random text without dates or location
        </div>
    """)
    item = page.locator("[data-testid='jcl-job-teaser-wrapper']")
    data = scraper.get_listing_data(item)
    assert data == {}
