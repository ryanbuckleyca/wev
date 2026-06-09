from scrapers.base import BaseScraper


class CocoScraper(BaseScraper):
    is_chronological = True
    force_headed_on_vpn = True
    listing_selector = "ul.job_listings li.job_listing"
    job_wait_selector = "article"

    def start_browser(self, headless=True, viewport=None):
        return super().start_browser(headless=headless, viewport=viewport, use_proxy=False)

    SELECTORS = {
        "job_title": "h1.entry-title",
        "date_posted": (".date-posted time", "text", "Posted on"),
        "description": (".job_description", "html"),
        "close_date": (".application-deadline", "text", "Closes: "),
        "location": ".location",
        "wage": ".salary",
        "organization": ".company .name strong",
        "employment_type": ".job-type",
    }
