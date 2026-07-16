from scrapers.ecocanada import EcoCanadaScraper


def make_source():
    return {"id": "ecocanada", "url": "https://ecoworks.eco.ca/", "name": "ECO Canada"}

def test_get_listings_url():
    scraper = EcoCanadaScraper(make_source())
    assert scraper.get_listings_url() == "https://ecoworks.eco.ca/jobs"

def test_has_next_page(page):
    scraper = EcoCanadaScraper(make_source())
    
    # Test True
    page.set_content('<ul class="pagination"><li class="page-item"><a rel="next" href="/jobs?page=2">Next</a></li></ul>')
    assert scraper.has_next_page(page) is True
    
    # Test False
    page.set_content('<ul class="pagination"><li class="page-item"><span>1</span></li></ul>')
    assert scraper.has_next_page(page) is False

def test_extract_job_fields(page):
    scraper = EcoCanadaScraper(make_source())
    page.set_content("<script>window.job = {"
        "'title': 'Environmental Scientist',"
        "'description': '<p>Test description</p>',"
        "'employer': {'name': 'Test Org'},"
        "'location': 'Calgary, AB',"
        "'min_compensation': '60000.00',"
        "'max_compensation': '80000.00',"
        "'compensation_currency': 'cad',"
        "'compensation_time_frame': 'annually',"
        "'employmentType': 'FULL_TIME',"
        "'posted_at': '2026-07-15T15:08:23.000000Z',"
        "'validThrough': '2026-07-29T15:08:23.000000Z'"
    "};</script>")
    
    scraper.extract_job_fields(page, {"listing_url": "https://ecoworks.eco.ca/jobs/123"}, 0)
    
    assert len(scraper.jobs) == 1
    job = scraper.jobs[0]
    
    assert job["job_title"] == "Environmental Scientist"
    assert job["organization"] == "Test Org"
    assert job["description"] == "<p>Test description</p>"
    assert job["location"] == "Calgary, AB"
    assert job["wage"] == "$60000.00 - $80000.00 CAD annually"
    assert job["employment_type"] == "full-time"
    assert job["date_posted"] == "2026-07-15"
    assert job["close_date"] == "2026-07-29"
    assert job["listing_url"] == "https://ecoworks.eco.ca/jobs/123"
