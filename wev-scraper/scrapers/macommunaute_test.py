
from scrapers.macommunaute import MaCommunauteScraper


def make_source(url="https://macommunaute.ca/emplois/"):
    return {"id": "macommunaute", "url": url, "name": "Ma Communauté"}

def test_extract_job_title(page):
    scraper = MaCommunauteScraper(make_source())
    page.set_content("""
        <html>
            <body>
                <h1 class="entry-title">Poste de coordonnateur</h1>
            </body>
        </html>
    """)
    title = scraper.extract_job_title(page, {})
    assert title == "Poste de coordonnateur"

def test_extract_description_strips_header(page):
    scraper = MaCommunauteScraper(make_source())
    page.set_content("""
        <html>
            <body>
                <div class="post-content">
                    Accueil » Emplois » OFFRE D'EMPLOI
                    Ceci est le contenu de l'offre.
                </div>
            </body>
        </html>
    """)
    desc = scraper.extract_description(page, {})
    assert desc == "Ceci est le contenu de l'offre."

def test_extract_employment_type_from_url(page):
    scraper = MaCommunauteScraper(make_source("https://macommunaute.ca/benevolat/"))
    etype = scraper.extract_employment_type(page, {})
    assert etype == "volunteer"

def test_extract_employment_type_from_content(page):
    scraper = MaCommunauteScraper(make_source())
    page.set_content("""
        <html>
            <body>
                <div class="entry-content">
                    Ce poste est à temps plein.
                </div>
            </body>
        </html>
    """)
    etype = scraper.extract_employment_type(page, {})
    assert etype == "full-time"

def test_get_listing_data(page):
    scraper = MaCommunauteScraper(make_source())
    # Mocking a locator item is harder with page.set_content + locator
    # We test get_listing_data by passing it a locator for an <a> tag
    page.set_content("""
        <div class="card-posts">
            <a class="card-post" href="/job-1/">
                <span class="date">12 mars 2026 • <i>Montréal</i></span>
                <h3>Titre du poste</h3>
                <span class="auteur">Organisation ABC</span>
            </a>
        </div>
    """)
    item = page.locator("a.card-post").first
    data = scraper.get_listing_data(item)
    
    assert data["date_posted"] == "12 mars 2026"
    assert data["location"] == "Montréal"
    assert data["job_title"] == "Titre du poste"
    assert data["organization"] == "Organisation ABC"
