import re

from scrapers.base import BaseScraper
from utils.log import scraper_log

# Provinces to filter by. Passed one at a time to the Acuspire search widget.
FILTER_PROVINCES = ["Ontario", "Quebec"]

# CSS selector patterns tried in order when the primary wage selector finds nothing.
WAGE_FALLBACK_SELECTORS = [
    '[class*="wage"]',
    '[class*="salary"]',
    '[class*="compensation"]',
    '[class*="pay"]',
]


class EcoCanadaScraper(BaseScraper):
    is_chronological = True
    filter_values = FILTER_PROVINCES
    listing_selector = ".acuspire-job-container"
    job_wait_selector = ".job-description-wrapper"
    SELECTORS = {
        "organization": ".job-company",
        "wage": ".wage_tag",
    }

    def start_browser(self, headless=True, viewport=None, **kwargs):
        return super().start_browser(
            headless=headless,
            viewport=viewport or {"width": 1280, "height": 1400},
            use_stealth=False,
            **kwargs,
        )

    def open_listings_page(self, page, filter_value=None):
        self._goto_with_networkidle(page, self.source["url"])
        self._accept_consent_popup(page)
        self._dismiss_overlay(page)
        # Wait for the widget to appear before attempting to filter
        page.wait_for_selector(self.listing_selector, state="attached", timeout=30000)
        if filter_value:
            self._apply_province_filter(page, filter_value)
        scraper_log("\t✓ Job listings loaded")

    def _apply_province_filter(self, page, province: str):
        scraper_log(f"\tFiltering by province: {province}")
        loc = page.get_by_placeholder("Province", exact=False)
        try:
            loc.first.wait_for(state="attached", timeout=15000)
            loc.first.fill(province)
        except Exception:
            scraper_log("\t⚠️ Could not find placeholder, trying fallback class")
            loc = page.locator(".acuspire-job-search input").first
            loc.wait_for(state="attached", timeout=15000)
            loc.fill(province)
            
        page.get_by_role("button", name="Search Jobs").first.click()
        # Wait for the results to refresh by waiting for the current listings to detach
        try:
            page.wait_for_selector(self.listing_selector, state="detached", timeout=5000)
        except Exception:
            # If they don't detach quickly, they might already be gone or the refresh is slow
            pass
        page.wait_for_selector(self.listing_selector, state="attached", timeout=15000)

    def get_listing_items(self, page):
        try:
            return super().get_listing_items(page)
        except Exception:
            try:
                self.upload_error_screenshot_from_page(page, "ecocanada-no-listings")
            except Exception:
                pass
            raise

    def _get_card_href(self, item) -> str | None:
        """Extract the raw href from a listing card (used by get_listing_data)."""
        try:
            return item.locator("h3.job-title-container a").first.get_attribute("href", timeout=1000)
        except Exception:
            return None

    def get_job_url(self, item):
        """Delegate to BaseScraper after extracting the href via the Acuspire-specific locator."""
        href = self._get_card_href(item)
        if not href:
            return None
        # Resolve to a full URL, then apply the base board-URL guard
        full_url = href if href.startswith("http") else self.build_full_url(href)
        source_url = (self.source or {}).get("url", "")
        if source_url and full_url.rstrip("/") == source_url.rstrip("/"):
            return None
        return full_url

    def get_listing_data(self, item):
        """Capture the listing URL from the card before opening the job page."""
        href = self._get_card_href(item)
        if not href:
            return {}
        full_url = href if href.startswith("http") else self.build_full_url(href)
        return {"listing_url": full_url}

    # Selector for the Acuspire pagination "next page" control.
    _NEXT_PAGE_SELECTOR = (
        ".acuspire-pagination button[aria-label='Next page'], "
        ".acuspire-pagination [class*='next']"
    )

    def has_next_page(self, page):
        """Return True if the Acuspire widget has an enabled next-page button."""
        try:
            btn = page.locator(self._NEXT_PAGE_SELECTOR).first
            return btn.count() > 0 and btn.is_enabled(timeout=2000)
        except Exception:
            return False

    def go_next_page(self, page):
        old_text = page.locator(self.listing_selector).first.inner_text()
        page.locator(self._NEXT_PAGE_SELECTOR).first.click()
        page.wait_for_function(
            """(old_text) => {
                const el = document.querySelector('.acuspire-job-container');
                return el && el.innerText !== old_text;
            }""",
            arg=old_text,
        )
        self.current_page_number += 1

    # ---- Field extraction ----

    def extract_date_posted(self, page, listing_data):
        raw = page.locator("span.posted-job-time").inner_text().replace("Posted", "").strip()
        return raw or None

    def extract_job_title(self, page, listing_data):
        return page.locator("span.job-title").inner_text().strip()

    def extract_location(self, page, listing_data):
        els = page.locator(".job-card-summary-section .svg-and-text")
        parts = []
        for i in range(min(els.count(), 2)):
            txt = els.nth(i).locator("span").inner_text().strip()
            if txt:
                parts.append(txt)
        return ", ".join(parts) or None

    def extract_wage(self, page, listing_data):
        wage = self.extract_with_selectors(page, {"wage": ".wage_tag"}).get("wage")
        return wage or self._extract_wage_fallback(page)

    def extract_description(self, page, listing_data):
        return page.eval_on_selector(
            ".job-description-wrapper",
            """(el) => {
                el.querySelectorAll("table").forEach(t => t.remove());
                return el.innerHTML;
            }""",
        )

    def _extract_wage_fallback(self, job_page) -> str | None:
        """Try WAGE_FALLBACK_SELECTORS in order to find a wage/salary element."""
        for sel in WAGE_FALLBACK_SELECTORS:
            try:
                loc = job_page.locator(sel)
                if loc.count() >= 1:
                    txt = loc.first.inner_text(timeout=1000).strip()
                    if txt and ("$" in txt or "salary" in txt.lower() or "wage" in txt.lower()):
                        return txt
            except Exception:
                continue
        return None

    # ---- Popup / overlay helpers ----

    def _accept_consent_popup(self, page):
        """Click the first consent button that responds, then wait for it to disappear."""
        consent_container_selector = (
            '[class*="consent"], [class*="cookie"], [id*="consent"], '
            '#accept-all, #acceptAll, .accept-all, [data-cky-tag="accept-button"]'
        )
        for try_click in [
            lambda: page.get_by_role("button", name=re.compile(r"accept all|accept", re.I)).first.click(timeout=3000),
            lambda: page.get_by_role("button", name=re.compile(r"allow", re.I)).first.click(timeout=3000),
            lambda: page.locator('[class*="consent"] button, [class*="cookie"] button, [id*="consent"] button').first.click(timeout=3000),
            lambda: page.locator('#accept-all, #acceptAll, .accept-all, [data-cky-tag="accept-button"]').first.click(timeout=3000),
        ]:
            try:
                try_click()
                # Wait for the consent container to leave the DOM rather than sleeping
                try:
                    page.wait_for_selector(consent_container_selector, state="hidden", timeout=3000)
                except Exception:
                    pass
                return
            except Exception:
                continue

    def _dismiss_overlay(self, page):
        """Dismiss any overlay/modal (e.g. ECO IMPACT ad). No-op if nothing is found."""
        # Scope the post-click wait to ECO IMPACT specifically to avoid matching job detail modals
        eco_impact_selector = '[class*="overlay"]:has-text("ECO IMPACT"), [class*="modal"]:has-text("ECO IMPACT")'
        for try_click in [
            lambda: page.locator('[aria-label="Close"]').first.click(timeout=2000),
            lambda: page.locator('[aria-label="close"]').first.click(timeout=2000),
            lambda: page.get_by_role("button", name=re.compile(r"close|dismiss|×|\bx\b", re.I)).first.click(timeout=2000),
            lambda: page.get_by_text("×", exact=True).first.click(timeout=2000),
            lambda: page.locator('button[class*="close"], [class*="close"]').first.click(timeout=2000),
            lambda: page.locator('.modal-close, [data-dismiss="modal"]').first.click(timeout=2000),
            lambda: page.locator('[title="Close"], [title="close"]').first.click(timeout=2000),
            lambda: page.locator('[class*="overlay"]').filter(has_text="ECO IMPACT").locator("button").first.click(timeout=2000),
            lambda: page.locator('[class*="modal"]').filter(has_text="ECO IMPACT").locator("button").first.click(timeout=2000),
        ]:
            try:
                try_click()
                # Wait for the ECO IMPACT overlay specifically to leave the DOM
                try:
                    page.wait_for_selector(eco_impact_selector, state="hidden", timeout=2000)
                except Exception:
                    pass
                return
            except Exception:
                continue
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass
