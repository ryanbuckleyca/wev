import pytest
from scrapers.centraide import CentraideScraper

def make_source():
    return {"id": "centraide", "url": "https://www.centraide-mtl.org/carrieres/", "name": "Centraide"}

def test_extract_job_title(page):
    scraper = CentraideScraper(make_source())
    page.set_content("""
        <html>
            <body>
                <section class="single-main">
                    <h1>Developer Position</h1>
                </section>
            </body>
        </html>
    """)
    title = scraper.extract_job_title(page, {})
    assert title == "Developer Position"

def test_extract_date_posted(page):
    scraper = CentraideScraper(make_source())
    page.set_content("""
        <html>
            <body>
                <section class="single-main">
                    <div class="entry-content">
                        Publié le 15 Mars 2024
                    </div>
                </section>
            </body>
        </html>
    """)
    date = scraper.extract_date_posted(page, {})
    assert date == "15 Mars 2024"

def test_extract_description(page):
    scraper = CentraideScraper(make_source())
    page.set_content("""
        <html>
            <body>
                <section class="single-main">
                    <div class="entry-content">
                        This is a job description.
                        <table><tr><td>Should be removed</td></tr></table>
                    </div>
                </section>
            </body>
        </html>
    """)
    desc = scraper.extract_description(page, {})
    assert "This is a job description." in desc
    assert "Should be removed" not in desc

def test_extract_employment_type_volunteer(page):
    scraper = CentraideScraper(make_source())
    page.set_content("""
        <html>
            <body>
                <section class="single-main">
                    <div class="entry-content">
                        C'est un poste bénévole.
                    </div>
                </section>
            </body>
        </html>
    """)
    etype = scraper.extract_employment_type(page, {})
    assert etype == "volunteer"

def test_extract_wage(page):
    scraper = CentraideScraper(make_source())
    page.set_content("""
        <html>
            <body>
                <section class="single-main">
                    <div class="entry-content">
                        Le salaire est de 50 000$ par année.
                    </div>
                </section>
            </body>
        </html>
    """)
    wage = scraper.extract_wage(page, {})
    assert "50 000" in wage
