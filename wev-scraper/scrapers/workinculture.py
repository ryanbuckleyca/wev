from scrapers.base import BaseScraper


class WorkInCultureScraper(BaseScraper):
    """Scraper for workinculture.ca job board.
    
    The listings are loaded via Algolia search (ais-Hits-list).
    We extract the job URL directly from the data-ref attribute of the article,
    which allows us to bypass the preview modal entirely and go straight to the job page.
    """
    is_chronological = True
    force_headed = True
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
        # Assuming the class is 'job-deadline' based on user's hint
        "close_date": ".job-listing-meta .job-deadline",
    }

    def get_job_url(self, item):
        try:
            href = item.get_attribute("data-ref")
            if not href:
                href = item.locator("a").first.get_attribute("href")
            
            if href:
                return href if href.startswith("http") else self.build_full_url(href)
        except Exception:
            pass
        return None
