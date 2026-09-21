from scrapers.idealist import IdealistScraper


def jobs_source():
    return {
        "id": "test-jobs",
        "url": "https://www.idealist.org/en/jobs",
        "name": "Idealist Jobs",
        "slug": "idealist",
    }


def intern_source():
    return {
        "id": "test-intern",
        "url": "https://www.idealist.org/en/internships",
        "name": "Idealist Internships",
        "slug": "idealistintern",
    }


def test_get_listings_url_jobs():
    scraper = IdealistScraper(jobs_source())
    assert scraper.get_listings_url() == "https://www.idealist.org/en/jobs"


def test_get_listings_url_internships():
    scraper = IdealistScraper(intern_source())
    assert scraper.get_listings_url() == "https://www.idealist.org/en/internships"


def test_extract_job_title(page):
    scraper = IdealistScraper(jobs_source())
    page.set_content('<div data-qa-id="listing-name">Director of Development</div>')
    assert scraper.extract_job_title(page, {}) == "Director of Development"


def test_extract_job_title_falls_back_to_listing_data(page):
    scraper = IdealistScraper(jobs_source())
    page.set_content("<div>no title</div>")
    assert scraper.extract_job_title(page, {"job_title": "Fallback"}) == "Fallback"


def test_extract_organization(page):
    scraper = IdealistScraper(jobs_source())
    page.set_content('<a data-qa-id="org-link">CNIB</a>')
    assert scraper.extract_organization(page, {}) == "CNIB"


def test_extract_location_from_detail(page):
    scraper = IdealistScraper(jobs_source())
    page.set_content(
        '<span data-qa-id="location-sentence">, Work must be performed in or near Montréal, QC, Canada</span>'
    )
    assert "Montréal, QC, Canada" in scraper.extract_location(page, {})


def test_extract_location_falls_back_to_listing(page):
    scraper = IdealistScraper(jobs_source())
    page.set_content("<div></div>")
    assert scraper.extract_location(page, {"location": "Toronto, ON, Canada"}) == "Toronto, ON, Canada"


def test_extract_wage(page):
    scraper = IdealistScraper(jobs_source())
    page.set_content(
        '<div data-qa-id="listing-compensation">Salary:\nCAD 80,000 - 95,000 / year</div>'
    )
    wage = scraper.extract_wage(page, {})
    assert wage is not None
    assert "80,000" in wage


def test_extract_date_posted_from_attr(page):
    scraper = IdealistScraper(jobs_source())
    page.set_content(
        '<div data-qa-id="listing-header-published-since" data-published-date="2026-09-03">'
        "Published 17 days ago</div>"
    )
    assert scraper.extract_date_posted(page, {}) == "2026-09-03"


def test_extract_employment_type_from_detail(page):
    scraper = IdealistScraper(jobs_source())
    page.set_content("<main>Details\nJob Type:\nFull Time\nEducation:</main>")
    assert scraper.extract_employment_type(page, {}) == "Full Time"


def test_extract_employment_type_internship_board(page):
    scraper = IdealistScraper(intern_source())
    page.set_content("<main>Job Type:\nFull Time</main>")
    assert scraper.extract_employment_type(page, {}) == "internship"


def test_extract_description(page):
    scraper = IdealistScraper(jobs_source())
    page.set_content("""
        <h2>Description</h2>
        <div>About the role and responsibilities.</div>
    """)
    assert "About the role" in scraper.extract_description(page, {})


def test_get_listing_data(page):
    scraper = IdealistScraper(jobs_source())
    page.set_content("""
        <div id="search-hit-abc" data-qa-id="search-result">
            <a href="/en/nonprofit-job/abc-director-cnib-toronto">
                <span data-qa-id="search-result-link">Director</span>
                <h4>CNIB</h4>
                <div>Hybrid</div>
                <div>Toronto, ON, Canada</div>
                <div>Full Time</div>
                <div>CAD 100,000 / year</div>
                <div>Posted 3 days ago</div>
            </a>
        </div>
    """)
    item = page.locator('[data-qa-id="search-result"]')
    data = scraper.get_listing_data(item)
    assert data["job_title"] == "Director"
    assert data["organization"] == "CNIB"
    assert "Toronto" in data["location"]
    assert data["employment_type"] == "Full Time"
    assert "date_posted" not in data
    assert data.get("wage")


def test_get_job_url_skips_non_canadian(page):
    scraper = IdealistScraper(jobs_source())
    page.set_content("""
        <div id="search-hit-abc" data-qa-id="search-result">
            <a href="/en/nonprofit-job/abc-role-org-nyc">
                <span data-qa-id="search-result-link">Staff Attorney</span>
                <h4>Some Org</h4>
                <div>On-site</div>
                <div>New York, NY</div>
                <div>Full Time</div>
                <div>Posted 1 day ago</div>
            </a>
        </div>
    """)
    item = page.locator('[data-qa-id="search-result"]')
    assert scraper.get_job_url(item) is None


def test_get_job_url_keeps_canadian(page):
    scraper = IdealistScraper(jobs_source())
    page.set_content("""
        <div id="search-hit-abc" data-qa-id="search-result">
            <a href="/en/nonprofit-job/abc-director-cnib-toronto">
                <span data-qa-id="search-result-link">Director</span>
                <h4>CNIB</h4>
                <div>Hybrid</div>
                <div>Toronto, ON, Canada</div>
                <div>Full Time</div>
                <div>Posted 3 days ago</div>
            </a>
        </div>
    """)
    item = page.locator('[data-qa-id="search-result"]')
    url = scraper.get_job_url(item)
    assert url is not None
    assert "/nonprofit-job/" in url


def test_has_empty_results_true_for_zero_count(page):
    scraper = IdealistScraper(jobs_source())
    page.set_content("<main><h1>Jobs</h1><h2>0 jobs</h2><p>No jobs match your search</p></main>")
    assert scraper._has_empty_results(page) is True


def test_has_empty_results_false_when_listings_present(page):
    scraper = IdealistScraper(jobs_source())
    page.set_content("<main><h1>Jobs</h1><h2>6 jobs</h2></main>")
    assert scraper._has_empty_results(page) is False


def test_sort_newest_returns_false_when_control_missing(page):
    scraper = IdealistScraper(jobs_source())
    page.set_content("<main><h1>Jobs</h1></main>")
    assert scraper._sort_newest(page) is False


def test_get_listing_items_empty_when_verified(page):
    scraper = IdealistScraper(intern_source())
    page.set_content(
        "<main><h1>Internships</h1><h2>0 internships</h2>"
        "<p>No internships match your search: All internships near Canada</p></main>"
    )
    items = scraper.get_listing_items(page)
    assert items.count() == 0
