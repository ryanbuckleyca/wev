from scrapers.cooperationcanada import CooperationCanadaScraper


def make_source(url="https://cooperation.ca/careers/"):
    return {
        "id": "coopcan-test",
        "url": url,
        "name": "Cooperation Canada",
        "slug": "coopcan",
    }


def test_get_job_url_prefers_careers_path(page):
    scraper = CooperationCanadaScraper(make_source())
    page.set_content(
        """
        <article class="card-tw_job">
          <a href="https://example.org/org-site/"><img alt=""></a>
          <header>
            <a href="https://cooperation.ca/careers/chief-of-staff/" title="CHIEF OF STAFF">
              <h3 class="uk-card-title">CHIEF OF STAFF</h3>
            </a>
            <aside class="tw-card-meta">
              <ul>
                <li class="publisher">
                  <a href="https://oxfam.ca/" target="_blank">Oxfam Canada</a>
                </li>
              </ul>
            </aside>
          </header>
        </article>
        """
    )
    item = page.locator("article.card-tw_job").first
    assert scraper.get_job_url(item) == "https://cooperation.ca/careers/chief-of-staff/"


def test_get_listing_data(page):
    scraper = CooperationCanadaScraper(make_source())
    page.set_content(
        """
        <article class="uk-card card-tw_job">
          <header class="uk-card-body">
            <a href="https://cooperation.ca/careers/finance-assistant/">
              <h3 class="uk-card-title uk-link-heading">Finance Assistant</h3>
            </a>
            <aside class="tw-card-meta post-meta entry-meta">
              <ul>
                <li class="">Part Time</li>
                <li class="date_published">
                  Published:
                  <time class="updated" datetime="2026-09-03">September 3, 2026</time>
                </li>
                <li class="date_closed ">
                  Closing:
                  <time class="updated" datetime="2026-09-21">September 21, 2026</time>
                </li>
                <li class="publisher">
                  <a href="https://seedchange.org/" target="_blank">SeedChange</a>
                </li>
              </ul>
            </aside>
          </header>
        </article>
        """
    )
    item = page.locator("article.card-tw_job").first
    data = scraper.get_listing_data(item)
    assert data["job_title"] == "Finance Assistant"
    assert data["date_posted"] == "2026-09-03"
    assert data["close_date"] == "2026-09-21"
    assert data["organization"] == "SeedChange"
    assert data["employment_type"] == "Part Time"


def test_extract_job_title(page):
    scraper = CooperationCanadaScraper(make_source())
    page.set_content('<h1 class="uk-article-title">Practice Lead</h1>')
    assert scraper.extract_job_title(page, {}) == "Practice Lead"


def test_extract_organization_from_header(page):
    scraper = CooperationCanadaScraper(make_source())
    page.set_content(
        """
        <div id="header-content">
          <h1 class="uk-article-title">VP Role</h1>
          <div class="uk-h2">
            <a class="uk-text-link" href="https://kinvia.ca/">Kinvia</a>
          </div>
        </div>
        """
    )
    assert scraper.extract_organization(page, {}) == "Kinvia"


def test_extract_organization_prefers_listing(page):
    scraper = CooperationCanadaScraper(make_source())
    page.set_content("<div></div>")
    assert scraper.extract_organization(page, {"organization": "SeedChange"}) == "SeedChange"


def test_extract_date_posted_and_close_date(page):
    scraper = CooperationCanadaScraper(make_source())
    page.set_content(
        """
        <div id="tw_job-publish_date">
          Published: <time datetime="2026-09-11T14:44:51">September 11, 2026</time>
        </div>
        <div id="tw_job-expiration_date">
          Closing: <time datetime="2026-10-11T00:00:00">October 11, 2026</time>
        </div>
        """
    )
    assert scraper.extract_date_posted(page, {}) == "2026-09-11T14:44:51"
    assert scraper.extract_close_date(page, {}) == "2026-10-11T00:00:00"


def test_extract_employment_type_and_wage(page):
    scraper = CooperationCanadaScraper(make_source())
    page.set_content(
        """
        <div id="tw_job-type"><strong>Position</strong>: Full Time</div>
        <div id="tw_job-salary"><strong>Salary</strong>: $150,000-185,000</div>
        <div class="post-content">
          <p><strong>Location</strong> Ontario</p>
        </div>
        """
    )
    assert scraper.extract_employment_type(page, {}) == "Full Time"
    wage = scraper.extract_wage(page, {})
    assert wage is not None
    assert "150,000" in wage
    assert scraper.extract_location(page, {}) == "Ontario"


def test_extract_description(page):
    scraper = CooperationCanadaScraper(make_source())
    page.set_content(
        """
        <div class="post-content">
          <p>About this opportunity</p>
          <p>Reporting to the President.</p>
        </div>
        """
    )
    desc = scraper.extract_description(page, {})
    assert "Reporting to the President." in desc
