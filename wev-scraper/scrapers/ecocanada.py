import re
from scrapers.base import BaseScraper
from utils.log import scraper_log

# Provinces to filter by. Passed one at a time to the Acuspire search widget.
FILTER_PROVINCES = ["Ontario", "Quebec"]


class EcoCanadaScraper(BaseScraper):
    is_chronological = True
    filter_values = FILTER_PROVINCES
    listing_selector = ".acuspire-job-container"
    job_wait_selector = ".job-description-wrapper"

    def start_browser(self, headless=True, viewport=None, **kwargs):
        """Plain Chromium — no stealth, no real Chrome. The Acuspire widget renders fine with it."""
        from playwright.sync_api import sync_playwright

        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(
            headless=self._resolve_headless(headless),
            args=["--disable-blink-features=AutomationControlled"],
        )
        self.context = self.browser.new_context(
            viewport=viewport or {"width": 1280, "height": 1400},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        self.context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        )
        self.page = self.context.new_page()
        return self.page

    def open_listings_page(self, page, filter_value=None):
        page.goto(self.source["url"], wait_until="domcontentloaded")
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        self._accept_consent_popup(page)
        self._dismiss_overlay(page)
        if filter_value:
            self._apply_province_filter(page, filter_value)
        page.wait_for_selector(self.listing_selector, state="attached", timeout=15000)
        scraper_log("\t✓ Job listings loaded")

    def _apply_province_filter(self, page, province: str):
        scraper_log(f"\tFiltering by province: {province}")
        loc = page.get_by_placeholder("City or Province or Remote")
        loc.wait_for(state="attached", timeout=30000)
        loc.fill(province)
        page.get_by_role("button", name="Search Jobs").click()
        page.wait_for_selector(self.listing_selector, state="attached", timeout=15000)

    def get_listing_items(self, page):
        items = page.locator(self.listing_selector)
        count = items.count()
        if count == 0:
            try:
                self.upload_error_screenshot_from_page(page, "ecocanada-no-listings")
            except Exception:
                pass
            raise Exception("No job listings found on page")
        scraper_log(f"\t✓ Found {count} job items")
        return items

    def _get_card_href(self, item) -> str | None:
        """Extract and validate the job URL from a listing card."""
        try:
            href = item.locator("h3.job-title-container a").first.get_attribute("href", timeout=1000)
        except Exception:
            return None
        if not href:
            return None
        full_url = href if href.startswith("http") else self.build_full_url(href)
        return None if full_url.rstrip("/") == self.source["url"].rstrip("/") else full_url

    def get_job_url(self, item):
        return self._get_card_href(item)

    def get_listing_data(self, item):
        """Capture the listing URL from the card before opening the job page."""
        url = self._get_card_href(item)
        return {"listing_url": url} if url else {}

    def has_next_page(self, page):
        return self.page_count > 1 and self.current_page_number < self.page_count

    def go_next_page(self, page):
        old_text = page.locator(self.listing_selector).first.inner_text()
        self.next_button.click()
        page.wait_for_function(
            """(old_text) => {
                const el = document.querySelector('.acuspire-job-container');
                return el && el.innerText !== old_text;
            }""",
            arg=old_text,
        )
        self.setup_pagination(page)
        self.current_page_number += 1

    # ---- Field extraction (uses base class SELECTORS contract) ----

    SELECTORS = {
        "organization": ".job-company",
        "wage": ".wage_tag",
    }

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
        """Try common class-name patterns to find a wage/salary element."""
        for sel in ['[class*="wage"]', '[class*="salary"]', '[class*="compensation"]', '[class*="pay"]']:
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
