from scrapers.base import BaseScraper
from utils.log import scraper_log


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
        # Unverified — confirm against live site HTML before relying on this.
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

    def has_next_page(self, page):
        try:
            btn = page.locator(".ais-InfiniteHits-loadMore")
            if btn.count() > 0 and btn.first.is_enabled(timeout=2000):
                return True
        except Exception:
            pass
        try:
            next_item = page.locator(
                ".ais-Pagination-item--next:not(.ais-Pagination-item--disabled)"
            )
            if next_item.count() > 0:
                return True
        except Exception:
            pass
        return False

    def go_next_page(self, page):
        try:
            btn = page.locator(".ais-InfiniteHits-loadMore").first
            if btn.count() > 0 and btn.is_enabled(timeout=2000):
                scraper_log("\tClicking Algolia 'Load More' button…")
                btn.scroll_into_view_if_needed()
                btn.click(timeout=5000)
                page.wait_for_timeout(1000)
                return
        except Exception as e:
            scraper_log(f"\tInfiniteHits button unavailable or failed: {e}")
        try:
            next_link = page.locator(
                ".ais-Pagination-item--next:not(.ais-Pagination-item--disabled) a"
            ).first
            scraper_log("\tClicking Algolia pagination next link…")
            next_link.click(timeout=5000)
            page.wait_for_timeout(1000)
        except Exception as e:
            scraper_log(f"\tPagination failed: {e}")
