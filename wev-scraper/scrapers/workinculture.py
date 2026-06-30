from scrapers.base import BaseScraper


class WorkInCultureScraper(BaseScraper):
    """Scraper for workinculture.ca job board.

    The listings are loaded via Algolia search (ais-Hits-list).
    We extract the job URL directly from the data-ref attribute of the article,
    which bypasses the preview modal and goes straight to the job page.
    """
    # Confirmed newest-first via inspection on 2026-06-29.
    is_chronological = True
    listing_selector = "ol.ais-Hits-list article"
    job_wait_selector = "div.single_job_listing"

    SELECTORS = {
        "job_title": ".wp-block-post-title",
        "organization": ".company .name",
        "location": ".job-listing-meta .location",
        "employment_type": ".job-listing-meta .job-type",
        "wage": ".job-listing-meta .salary",
        "description": "#job-listing-description",
        "date_posted": (".job-listing-meta .date-posted time", ("attr", "datetime")),
        # Unverified — remove if it produces nulls in production.
        "close_date": ".job-listing-meta .job-deadline",
    }

    def get_job_url(self, item):
        try:
            href = item.get_attribute("data-ref")
        except Exception:
            href = None
        if href:
            return href if href.startswith("http") else self.build_full_url(href)
        return super().get_job_url(item)
