import traceback

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

    # Class-level constants for selectors
    LISTING_ARTICLE_SELECTOR = "ol.ais-Hits-list article"
    INFINITE_HITS_LOAD_MORE_BUTTON = ".ais-InfiniteHits-loadMore"
    PAGINATION_NEXT_ITEM = ".ais-Pagination-item--next:not(.ais-Pagination-item--disabled)"

    listing_selector = LISTING_ARTICLE_SELECTOR
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
        "close_date": (".job-listing-meta .job-deadline", "text", "Deadline: "),
    }

    def get_job_url(self, item):
        try:
            href = item.get_attribute("data-ref")
        except Exception:
            href = None
        if href:
            full_url = href if href.startswith("http") else self.build_full_url(href)
            source_url = (self.source or {}).get("url", "")
            if source_url and full_url.rstrip("/") == source_url.rstrip("/"):
                return None
            return full_url
        return super().get_job_url(item)

    def _has_enabled_load_more_button(self, page) -> bool:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        try:
            btn = page.locator(self.INFINITE_HITS_LOAD_MORE_BUTTON)
            if btn.count() > 0 and btn.first.is_enabled(timeout=2000):
                return True
        except PlaywrightTimeoutError as e:
            scraper_log(f"\tLoad-more button detection timed out: {e}\n{traceback.format_exc()}")
            return False
        return False

    def has_next_page(self, page):
        if self._has_enabled_load_more_button(page):
            return True
        next_item = page.locator(self.PAGINATION_NEXT_ITEM)
        if next_item.count() > 0:
            return True
        return False

    def go_next_page(self, page):
        if self._has_enabled_load_more_button(page):
            try:
                btn = page.locator(self.INFINITE_HITS_LOAD_MORE_BUTTON).first
                scraper_log("\tClicking Algolia 'Load More' button…")
                btn.scroll_into_view_if_needed()
                btn.click(timeout=5000)
                page.wait_for_timeout(1000)
                return
            except Exception as e:
                scraper_log(f"\tInfiniteHits button click failed: {e}\n{traceback.format_exc()}")
                raise

        try:
            next_link_locator = page.locator(f"{self.PAGINATION_NEXT_ITEM} a")
            if next_link_locator.count() > 0:
                next_link = next_link_locator.first
                scraper_log("\tClicking Algolia pagination next link…")
                next_link.click(timeout=5000)
                page.wait_for_timeout(1000)
            else:
                raise Exception("No pagination next link found")
        except Exception as e:
            scraper_log(f"\tPagination failed: {e}\n{traceback.format_exc()}")
            raise
