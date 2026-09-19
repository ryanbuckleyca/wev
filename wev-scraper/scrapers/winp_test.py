import json

from scrapers.winp import (
    WinpBaseScraper,
    WinpJobsScraper,
    WinpVolunteerScraper,
    _VIEW_LANG,
    _as_jobposting,
    _html_to_visible_text,
    _iso_date,
    _schema_employment,
)


def volunteer_source():
    return {
        "id": "winpvol-test",
        "url": "https://workinnonprofits.ca/volunteer-jobs/search",
        "name": "WorkInNonProfits Volunteer",
    }


def jobs_source():
    return {
        "id": "winpjobs-test",
        "url": "https://workinnonprofits.ca/jobs/search",
        "name": "WorkInNonProfits Jobs",
    }


BINGO_JSONLD = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    "title": "Bingo Volunteer",
    "datePosted": "2026-08-26",
    "validThrough": "2026-09-23",
    "employmentType": "VOLUNTEER",
    "hiringOrganization": {
        "@type": "Organization",
        "name": "Bereaved Families of Ontario - Halton/Peel",
    },
}

BINGO_HTML = f"""
<script type="application/ld+json">{json.dumps(BINGO_JSONLD)}</script>
<div class="card">
  <span class="vj_title">Bingo Volunteer</span>
  <span class="vj_orgname">Bereaved Families of Ontario - Halton/Peel</span>
  <span class="vj_loc">Halton / Peel area<br>Mississauga, Ontario</span>
  <span class="vj_type">flexible / as needed</span>
  <div class="vj_desc"><p>About the volunteer opportunity.</p></div>
  <div class="vj_appinst">Please mention WorkInNonProfits.ca.</div>
</div>
"""

WFH_HTML = """
<div class="card">
  <span class="vj_title">Social Media Manager</span>
  <span class="vj_orgname">The Power of Play Foundation</span>
  <span class="vj_loc"><b><i>Work From Home</i></b> - From Anywhere</span>
  <div class="vj_desc"><p>Remote social media role.</p></div>
</div>
"""

RESPITE_JSONLD = {
    "@type": "JobPosting",
    "title": "Respite Worker",
    "datePosted": "2026-09-18",
    "validThrough": "2026-09-30",
    "employmentType": "PART_TIME",
    "hiringOrganization": {"name": "Strides Toronto"},
}

RESPITE_HTML = f"""
<script type="application/ld+json">{json.dumps(RESPITE_JSONLD)}</script>
<span class="vj_title">Respite Worker</span>
<span class="vj_orgname">Strides Toronto</span>
<span class="vj_loc">Toronto Metro area</span>
<span class="vj_type">on-call / relief / casual</span>
<span class="vj_sal">$25.64 to $29.86 per hour</span>
<div class="vj_desc"><p>Provide respite.</p></div>
"""

LISTING_CARD = """
<div id="2590" class="job_item card">
  <span class="lj_title float-left">
    <a href="/volunteer-jobs/view/2590/E/bingo-volunteer">Bingo Volunteer</a>
  </span>
  <span class="lj_date float-right">closes in 4 days</span>
  <span class="lj_org">Bereaved Families of Ontario - Halton/Peel</span>
  <span class="lj_loc">Mississauga, Ontario</span>
</div>
"""


def test_boards_share_base_and_listings_url():
    volunteer = WinpVolunteerScraper(volunteer_source())
    jobs = WinpJobsScraper(jobs_source())
    assert issubclass(WinpVolunteerScraper, WinpBaseScraper)
    assert issubclass(WinpJobsScraper, WinpBaseScraper)
    assert volunteer.get_listings_url().endswith("/volunteer-jobs/search")
    assert jobs.get_listings_url().endswith("/jobs/search")
    assert volunteer.listing_selector == jobs.listing_selector
    assert volunteer.is_chronological is True
    assert jobs.is_chronological is True


def test_first_scrape_collects_full_board_until_this_board_has_urls():
    volunteer = WinpVolunteerScraper(volunteer_source())
    jobs = WinpJobsScraper(jobs_source())
    volunteer.existing_urls = set()
    jobs.existing_urls = set()
    assert volunteer._should_collect_full_board() is True
    assert jobs._should_collect_full_board() is True

    volunteer.existing_urls = {
        "https://workinnonprofits.ca/volunteer-jobs/view/2606/E/youth-educator"
    }
    jobs.existing_urls = volunteer.existing_urls
    assert volunteer._should_collect_full_board() is False
    assert jobs._should_collect_full_board() is True

    jobs.existing_urls = {
        "https://www.charityvillage.com/jobs",
        "https://workinnonprofits.ca/volunteer-jobs/view/2606/E/youth-educator",
    }
    assert jobs._should_collect_full_board() is True

    jobs.existing_urls = {
        "https://workinnonprofits.ca/jobs/view/112501/E/respite-worker"
    }
    assert jobs._should_collect_full_board() is False


def test_extract_prefers_jsonld(page):
    scraper = WinpVolunteerScraper(volunteer_source())
    page.set_content(BINGO_HTML)
    listing = {}
    assert scraper.extract_job_title(page, listing) == "Bingo Volunteer"
    assert scraper.extract_organization(page, listing) == (
        "Bereaved Families of Ontario - Halton/Peel"
    )
    assert scraper.extract_date_posted(page, listing) == "2026-08-26"
    assert scraper.extract_close_date(page, listing) == "2026-09-23"
    assert scraper.extract_employment_type(page, listing) == "volunteer"


def test_extract_location_from_html_not_jsonld(page):
    scraper = WinpVolunteerScraper(volunteer_source())
    page.set_content(BINGO_HTML)
    loc = scraper.extract_location(page, {})
    assert "Mississauga" in loc
    assert "Halton" in loc


def test_html_fallback_when_jsonld_missing(page):
    scraper = WinpVolunteerScraper(volunteer_source())
    page.set_content(WFH_HTML)
    assert scraper.extract_job_title(page, {}) == "Social Media Manager"
    assert scraper.extract_organization(page, {}) == "The Power of Play Foundation"
    assert scraper.extract_date_posted(page, {}) is None
    assert scraper.extract_employment_type(page, {}) == "volunteer"
    loc = scraper.extract_location(page, {})
    assert "Work From Home" in loc
    assert "From Anywhere" in loc


def test_generic_location_uses_card_location(page):
    scraper = WinpVolunteerScraper(volunteer_source())
    page.set_content('<span class="vj_loc">International</span>')
    loc = scraper.extract_location(page, {"card_location": "Yaoundé, Cameroun"})
    assert "Yaoundé" in loc
    assert "International" in loc


def test_description_includes_how_to_apply(page):
    scraper = WinpVolunteerScraper(volunteer_source())
    page.set_content(BINGO_HTML)
    desc = scraper.extract_description(page, {})
    assert "volunteer opportunity" in desc
    assert "WorkInNonProfits.ca" in desc
    assert "<p>" not in desc


def test_description_strips_word_vml(page):
    scraper = WinpVolunteerScraper(volunteer_source())
    page.set_content(
        """
        <div class="vj_desc">
          <p><span><!-- [if gte vml 1]><v:shapetype>
            <v:f eqn="if lineDrawn pixelLineWidth 0"/></v:shapetype><![endif]--></span></p>
          <p>About the Role</p>
          <p>Help represent THE Network at community events.</p>
        </div>
        <div class="vj_appinst">Please mention WorkInNonProfits.ca.</div>
        """
    )
    desc = scraper.extract_description(page, {})
    assert "About the Role" in desc
    assert "THE Network" in desc
    assert "WorkInNonProfits.ca" in desc
    assert "v:f" not in desc
    assert "eqn=" not in desc
    assert "shapetype" not in desc


def test_html_to_visible_text_drops_office_smart_tags():
    raw = '<p>Office in <st1:place w:st="on">Toronto</st1:place>.</p>'
    assert _html_to_visible_text(raw) == "Office in Toronto."


def test_get_listing_data(page):
    scraper = WinpVolunteerScraper(volunteer_source())
    page.set_content(LISTING_CARD)
    data = scraper.get_listing_data(page.locator("div.job_item.card").first)
    assert data["job_title"] == "Bingo Volunteer"
    assert data["card_location"] == "Mississauga, Ontario"
    assert "location" not in data


def test_get_job_url(page):
    scraper = WinpVolunteerScraper(volunteer_source())
    page.set_content(LISTING_CARD)
    url = scraper.get_job_url(page.locator("div.job_item.card").first)
    assert url.endswith("/volunteer-jobs/view/2590/E/bingo-volunteer")


def test_get_job_url_prefers_english_on_bilingual_card(page):
    scraper = WinpJobsScraper(jobs_source())
    page.set_content(
        """
        <div class="job_item card">
          <span class="lj_title float-left">
            <a href="/jobs/view/112451/E/president-chief-executive-officer">President</a>
            <a href="/jobs/view/112451/F/presidence-et-direction-generale">Présidence</a>
          </span>
        </div>
        """
    )
    url = scraper.get_job_url(page.locator("div.job_item.card").first)
    assert "/E/" in url
    assert url.endswith("/jobs/view/112451/E/president-chief-executive-officer")


def test_has_next_page(page):
    scraper = WinpVolunteerScraper(volunteer_source())
    page.set_content(
        """
        <ul class="pagination">
          <li class="page-item active"><a class="page-link" href="#">1</a></li>
          <li class="page-item">
            <a class="page-link next_job_page" href="/volunteer-jobs/list?page=2"></a>
          </li>
        </ul>
        """
    )
    assert scraper.has_next_page(page) is True
    page.set_content(
        """
        <ul class="pagination">
          <li class="page-item disabled">
            <a class="page-link next_job_page" href="/volunteer-jobs/list?page=2"></a>
          </li>
        </ul>
        """
    )
    assert scraper.has_next_page(page) is False


def test_language_from_view_url():
    scraper = WinpVolunteerScraper(volunteer_source())
    en = scraper.create_job_dict(
        job_title="Bingo Volunteer",
        listing_url="https://workinnonprofits.ca/volunteer-jobs/view/2590/E/bingo-volunteer",
        description="x",
        organization="Org",
        location="Toronto",
        employment_type="volunteer",
    )
    fr = scraper.create_job_dict(
        job_title="Conseiller",
        listing_url="https://workinnonprofits.ca/volunteer-jobs/view/2525/F/conseiller",
        description="x",
        organization="Cuso International",
        location="International",
        employment_type="volunteer",
    )
    assert en["language"] == "en"
    assert fr["language"] == "fr"


def test_paid_job_extracts_wage_and_schema_employment(page):
    scraper = WinpJobsScraper(jobs_source())
    page.set_content(RESPITE_HTML)
    assert scraper.extract_job_title(page, {}) == "Respite Worker"
    assert scraper.extract_employment_type(page, {}) == "part-time"
    assert scraper.extract_wage(page, {}) == "$25.64 to $29.86"
    assert scraper.extract_date_posted(page, {}) == "2026-09-18"


def test_paid_job_falls_back_to_vj_type_when_jsonld_missing(page):
    scraper = WinpJobsScraper(jobs_source())
    page.set_content('<span class="vj_type">full time</span>')
    assert scraper.extract_employment_type(page, {}) == "full time"
    assert scraper.extract_wage(page, {}) is None


def test_volunteer_does_not_use_vj_type_as_employment(page):
    scraper = WinpVolunteerScraper(volunteer_source())
    page.set_content('<span class="vj_type">flexible / as needed</span>')
    assert scraper.extract_employment_type(page, {}) == "volunteer"


def test_helpers():
    assert _VIEW_LANG.search("/volunteer-jobs/view/2590/E/bingo-volunteer").group(1) == "E"
    assert _VIEW_LANG.search("/jobs/view/112501/F").group(1) == "F"
    assert _as_jobposting({"@type": "JobPosting", "title": "X"})["title"] == "X"
    assert _iso_date("2026-08-26T00:00:00Z") == "2026-08-26"
    assert _schema_employment("FULL_TIME") == "full-time"
    assert _schema_employment("PART_TIME") == "part-time"
    assert _schema_employment(None) is None
