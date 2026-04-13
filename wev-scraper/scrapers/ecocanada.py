import os
import re
from datetime import datetime
from scrapers.base import BaseScraper
from utils.log import scraper_log
from utils.extractors import detect_employment_type_from_texts

DETAIL_SELECTORS = {
    "organization": ".job-company",
    "wage": ".wage_tag",
}

class EcoCanadaScraper(BaseScraper):
    is_chronological = True
    # filter_values = [] means no province filtering — scrapes all of Canada
    filter_values = []
    listing_selector = ".acuspire-job-container"
    job_wait_selector = ".job-description-wrapper"

    def start_browser(self, headless=True, viewport=None, **kwargs):
        """Use plain Chromium (no stealth, no real Chrome) — the Acuspire widget renders fine with it."""
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
        self.context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
        self.page = self.context.new_page()
        return self.page

    def open_listings_page(self, page, filter_value=None):
        page.goto(self.source["url"], wait_until="networkidle")
        self._accept_consent_popup(page)
        self._dismiss_overlay(page)
        page.wait_for_selector(".acuspire-job-container", state="attached", timeout=15000)
        scraper_log("\t✓ Job listings loaded")

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

    def get_job_url(self, item):
        try:
            href = item.locator("h3.job-title-container a").first.get_attribute("href", timeout=1000)
        except Exception:
            return None
        if not href:
            return None
        full_url = href if href.startswith("http") else self.build_full_url(href)
        if full_url.rstrip("/") == self.source["url"].rstrip("/"):
            return None
        return full_url

    def _extract_wage_fallback(self, job_page) -> str | None:
        """Try common class-name patterns to find a wage/salary element."""
        for sel in ['[class*="wage"]', '[class*="salary"]', '[class*="compensation"]', '[class*="pay"]']:
            try:
                if job_page.locator(sel).count() >= 1:
                    txt = job_page.locator(sel).first.inner_text(timeout=1000).strip()
                    if txt and ("$" in txt or "salary" in txt.lower() or "wage" in txt.lower()):
                        return txt
            except Exception:
                continue
        return None

    def extract_job_fields(self, job_page, listing_data=None, index=0):
        listing_data = listing_data or {}

        date_str = job_page.locator("span.posted-job-time").inner_text().replace("Posted", "").strip()
        title = job_page.locator("span.job-title").inner_text().strip()

        scraper_log(f"\t\tProcessing job {index + 1}: '{title}' posted {date_str}...")

        if date_str:
            from utils.date_utils import is_recent_job, get_within_weeks
            if not is_recent_job(date_str, weeks=get_within_weeks(), lang="en"):
                scraper_log(f"\t\tSkipping out-dated job {index + 1}: '{title}'")
                if self.is_chronological:
                    self.should_quit_list = True
                return

        address_elements = job_page.locator(".job-card-summary-section .svg-and-text")
        address1 = address_elements.nth(0).locator("span").inner_text().strip() if address_elements.count() >= 1 else None
        address2 = address_elements.nth(1).locator("span").inner_text().strip() if address_elements.count() >= 2 else None
        location = ", ".join(filter(None, [address1, address2]))

        selector_data = self.extract_with_selectors(job_page, DETAIL_SELECTORS)
        wage = selector_data.get("wage") or self._extract_wage_fallback(job_page)

        description = job_page.eval_on_selector(
            ".job-description-wrapper",
            """(el) => {
                el.querySelectorAll("table").forEach(t => t.remove());
                return el.innerHTML;
            }"""
        )
        organization = selector_data.get("organization") or job_page.locator(".job-company").inner_text().strip()

        listing_url = listing_data.get("listing_url") or job_page.url
        if listing_url and listing_url.rstrip("/") == self.source.get("url", "").rstrip("/"):
            try:
                canonical = job_page.locator("link[rel='canonical']").get_attribute("href")
                if canonical:
                    listing_url = canonical
            except Exception:
                pass

        self.jobs.append(self.create_job_dict(
            language=getattr(self, "language", "en"),
            job_title=title,
            date_posted=datetime.fromisoformat(date_str).isoformat() if date_str else None,
            close_date=None,
            description=description,
            organization=organization,
            location=location,
            listing_url=listing_url or job_page.url,
            employment_type=detect_employment_type_from_texts([title, description, wage]),
            wage=wage,
        ))

    def go_next_page(self, page):
        old_text = self.listings_page.locator(self.listing_selector).first.inner_text()
        self.next_button.click()
        self.listings_page.wait_for_function(
            """(old_text) => {
                const el = document.querySelector('.acuspire-job-container');
                return el && el.innerText !== old_text;
            }""",
            arg=old_text
        )
        self.setup_pagination(self.listings_page)
        self.current_page_number += 1

    def _accept_consent_popup(self, page):
        for try_click in [
            lambda: page.get_by_role("button", name=re.compile(r"accept all|accept", re.I)).first.click(timeout=3000),
            lambda: page.get_by_role("button", name=re.compile(r"allow", re.I)).first.click(timeout=3000),
            lambda: page.locator('[class*="consent"] button, [class*="cookie"] button, [id*="consent"] button').first.click(timeout=3000),
            lambda: page.locator('#accept-all, #acceptAll, .accept-all, [data-cky-tag="accept-button"]').first.click(timeout=3000),
        ]:
            try:
                try_click()
                return
            except Exception:
                continue

    def _dismiss_overlay(self, page):
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
                return
            except Exception:
                continue
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass
