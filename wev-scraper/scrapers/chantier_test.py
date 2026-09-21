from scrapers.chantier import ChantierScraper, _BOARD_URL


def make_source(url=_BOARD_URL):
    return {
        "id": "chantier-test",
        "url": url,
        "name": "Chantier de l'économie sociale",
        "slug": "chantier",
    }


def test_get_listings_url_strips_job_id():
    scraper = ChantierScraper(
        make_source("https://chantier.qc.ca/decouvrez-leconomie-sociale/offres-demploi/19373")
    )
    assert scraper.get_listings_url() == _BOARD_URL


def test_get_listings_url_keeps_board_root():
    scraper = ChantierScraper(make_source(_BOARD_URL))
    assert scraper.get_listings_url() == _BOARD_URL


def test_get_job_url_prefers_title_board_url(page):
    scraper = ChantierScraper(make_source())
    page.set_content(
        """
        <a class="post-link"
           rel="19373"
           title="https://chantier.qc.ca/decouvrez-leconomie-sociale/offres-demploi/19373"
           href="https://chantier.qc.ca/offres-demploi/adjoint-e-administratif-ve-4/">
          <h3>Adjoint·e administratif·ve</h3>
        </a>
        """
    )
    item = page.locator("a.post-link").first
    assert (
        scraper.get_job_url(item)
        == "https://chantier.qc.ca/decouvrez-leconomie-sociale/offres-demploi/19373"
    )


def test_get_job_url_falls_back_to_rel(page):
    scraper = ChantierScraper(make_source())
    page.set_content(
        """
        <a class="post-link" rel="19371"
           href="https://chantier.qc.ca/offres-demploi/entretien/">
          <h3>Entretien</h3>
        </a>
        """
    )
    item = page.locator("a.post-link").first
    assert (
        scraper.get_job_url(item)
        == "https://chantier.qc.ca/decouvrez-leconomie-sociale/offres-demploi/19371/"
    )


def test_get_listing_data(page):
    scraper = ChantierScraper(make_source())
    page.set_content(
        """
        <a class="post-link" rel="19373"
           title="https://chantier.qc.ca/decouvrez-leconomie-sociale/offres-demploi/19373"
           href="#">
          <h3>Adjoint·e administratif·ve</h3>
        </a>
        """
    )
    data = scraper.get_listing_data(page.locator("a.post-link").first)
    assert data["job_title"] == "Adjoint·e administratif·ve"


def test_extract_fields_from_detail_pane(page):
    scraper = ChantierScraper(make_source())
    page.set_content(
        """
        <div id="ajax_content_blanc">
          <div id="single-post" class="19373">
            <div class="date_ajax_single">21 septembre 2026</div>
            <div class="titre_ajax_single"><h1>Adjoint·e administratif·ve</h1></div>
            <div class="contenu_ajax_single">
              <p>Description du poste.</p>
              <p>Salaire à partir de 28$/h;</p>
              <p>Lieu : 4529 Rue Clark #101, Montréal, QC H2T 2T3.</p>
              <hr>
              Offre présentée par: <strong>Village Urbain</strong><br>
              Date de fin de l'offre: <strong>9 octobre 2026</strong>
            </div>
          </div>
        </div>
        """
    )
    assert scraper.extract_job_title(page, {}) == "Adjoint·e administratif·ve"
    assert scraper.extract_date_posted(page, {}) == "21 septembre 2026"
    assert scraper.extract_organization(page, {}) == "Village Urbain"
    assert scraper.extract_close_date(page, {}) == "2026-10-09"
    assert "Montréal" in (scraper.extract_location(page, {}) or "")
    wage = scraper.extract_wage(page, {})
    assert wage is not None
    assert "28" in wage
    desc = scraper.extract_description(page, {})
    assert "Description du poste." in desc
    assert "Village Urbain" in desc


def test_extract_location_ignores_milieux_de_vie(page):
    scraper = ChantierScraper(make_source())
    page.set_content(
        """
        <div id="ajax_content_blanc">
          <div class="contenu_ajax_single">
            <p>des milieux de vie de qualité.</p>
            <p>Lieu : Québec, QC</p>
          </div>
        </div>
        """
    )
    assert scraper.extract_location(page, {}) == "Québec, QC"


def test_extract_organization_prefers_listing(page):
    scraper = ChantierScraper(make_source())
    page.set_content("<div id='ajax_content_blanc'></div>")
    assert scraper.extract_organization(page, {"organization": "SeedChange"}) == "SeedChange"
