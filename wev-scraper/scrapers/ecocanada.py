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
    filter_values = ["Ontario", "Quebec"]
    listing_selector = ".acuspire-job-container"
    job_wait_selector = ".job-description-wrapper"

    def check_date_then_proceed(self, job_page, index):
        """Check if job is recent enough to process. Returns (date_str, title) or None."""
        # Get date and title for recency check
        date_str = self._get_date_from_job_page(job_page)
        title = self._get_title_from_job_page(job_page)
        
        # Log individual job processing like base class does
        if date_str:
            scraper_log(f"\t\tProcessing job {index + 1}: '{title}' posted {date_str}...")
        else:
            scraper_log(f"\t\tProcessing job {index + 1}: '{title}' (date not available)...")
        
        # Check if job is recent enough
        if date_str:
            from utils.date_utils import is_recent_job, get_within_weeks
            weeks = get_within_weeks()
            
            lang = getattr(self, "date_language", None) or "en"
            if not is_recent_job(date_str, weeks=weeks, lang=lang):
                scraper_log(f"\t\tSkipping out-dated job {index + 1}: '{title}' posted {date_str}...")
                if self.is_chronological:
                    scraper_log("\t\tStopping early: chronological scraper encountered non-recent job")
                    self.should_quit_list = True
                return None
        
        return date_str, title
    
    def _get_date_from_job_page(self, job_page):
        return job_page.locator("span.posted-job-time").inner_text().replace("Posted", "").strip()

    def _get_title_from_job_page(self, job_page):
        return job_page.locator("span.job-title").inner_text().strip()

    def start_browser(self, headless=True, viewport=None):
        return super().start_browser(headless=headless, viewport={"width": 1280, "height": 1400})

    def get_job_url(self, item):
        try:
            job_link = item.locator("h3.job-title-container a").first
            href = job_link.get_attribute("href", timeout=1000)
        except Exception:
            return None
        if not href:
            return None
        full_url = href if href.startswith("http") else self.build_full_url(href)
        # Avoid returning the listings page URL
        if full_url.rstrip("/") == self.source["url"].rstrip("/"):
            return None
        return full_url

    def extract_job_fields(self, job_page, listing_data=None, index=0):
        """Extract job details from the job detail page."""
        listing_data = listing_data or {}
        result = self.check_date_then_proceed(job_page, index)
        if result is None:
            return
        date_posted_str, job_title = result
        job_card_summary_section = job_page.locator(".job-card-summary-section")
        address_elements = job_card_summary_section.locator(".svg-and-text")
        address1 = None
        address2 = None
        wage = None
        if address_elements.count() >= 1:
            address1 = address_elements.nth(0).locator("span").inner_text().strip()
        if address_elements.count() >= 2:
            address2 = address_elements.nth(1).locator("span").inner_text().strip()
        # Wage: try selector-config first, then common class patterns
        selector_data = self.extract_with_selectors(job_page, DETAIL_SELECTORS)
        if selector_data.get("wage"):
            wage = selector_data["wage"]
        if not wage:
            for sel in ['[class*="wage"]', '[class*="salary"]', '[class*="compensation"]', '[class*="pay"]']:
                try:
                    if job_page.locator(sel).count() >= 1:
                        txt = job_page.locator(sel).first.inner_text(timeout=1000).strip()
                        if txt and ("$" in txt or "salary" in txt.lower() or "wage" in txt.lower()):
                            wage = txt
                            break
                except Exception:
                    continue
        location = ", ".join(filter(None, [address1, address2]))
        description = job_page.eval_on_selector(
            ".job-description-wrapper",
            """(el) => {
                // Remove all table elements
                el.querySelectorAll("table").forEach(t => t.remove());
                return el.innerHTML;
            }"""
        )
        organization = selector_data.get("organization") or job_page.locator(".job-company").inner_text().strip()
        # Prefer the listing URL from the job card to avoid SPA rewriting
        listing_url = listing_data.get("listing_url") or job_page.url
        if listing_url and self.source:
            source_url = self.source.get("url", "")
            if source_url and listing_url.rstrip("/") == source_url.rstrip("/"):
                # If we only have the board URL, try a canonical link before falling back
                try:
                    canonical = job_page.locator("link[rel='canonical']").get_attribute("href")
                    if canonical:
                        listing_url = canonical
                except Exception:
                    pass
        if not listing_url:
            listing_url = job_page.url
        employment_type = detect_employment_type_from_texts([job_title, description, wage])
        job_dict = self.create_job_dict(
            language=getattr(self, "language", "en"),
            job_title=job_title,
            date_posted=datetime.fromisoformat(date_posted_str).isoformat(),
            close_date=None,
            description=description,
            organization=organization,
            location=location,
            listing_url=listing_url,
            employment_type=employment_type,
            wage=wage
        )
        
        # SSE classification is handled in the unified post-processor after all jobs are saved.
        self.jobs.append(job_dict)   

    def try_next_page(self):
        old_page_first_job = self.listings_page.locator(".acuspire-job-container").first.inner_text()
        self.next_button.click()
        # Wait until the first job container has changed, since the page is an SPA
        self.listings_page.wait_for_function(
            """(old_text) => {
                const el = document.querySelector('.acuspire-job-container');
                return el && el.innerText !== old_text;
            }""",
            arg=old_page_first_job
        )
        self.setup_pagination(self.listings_page)
        self.current_page_number += 1

    def filter_jobs(self, page, filter_value=None):
        if not filter_value:
            return
        scraper_log(f"\nFiltering by {filter_value}")
        loc = page.get_by_placeholder('City or Province or Remote')
        loc.wait_for(state='attached', timeout=30000)  # wait for widget to render
        scraper_log(f"Found placeholder: {loc.get_attribute('placeholder')}")
        loc.fill(filter_value)
        page.get_by_role("button", name="Search Jobs").click()
        page.wait_for_selector(".acuspire-job-container", state="attached")

    def _accept_consent_popup(self, page):
        """Accept the consent/privacy popup if it appears before the main content."""
        strategies = [
            # Explicit "Accept" or "Accept All" button
            lambda: page.get_by_role("button", name=re.compile(r"accept all|accept", re.I)).first.click(timeout=3000),
            # "Allow" button (common cookie consent wording)
            lambda: page.get_by_role("button", name=re.compile(r"allow", re.I)).first.click(timeout=3000),
            # Generic consent modal with an affirmative button
            lambda: page.locator('[class*="consent"] button, [class*="cookie"] button, [id*="consent"] button').first.click(timeout=3000),
            # CookieYes / OneTrust style
            lambda: page.locator('#accept-all, #acceptAll, .accept-all, [data-cky-tag="accept-button"]').first.click(timeout=3000),
        ]
        for try_click in strategies:
            try:
                try_click()
                page.wait_for_timeout(800)
                scraper_log("\tEcoCanada: consent popup accepted")
                return
            except Exception:
                continue

    def _dismiss_overlay(self, page):
        """Optionally dismiss overlay (e.g. ECO IMPACT ad) if present. No-op if not found or click fails; scraping continues either way."""
        # Try multiple strategies: the overlay has a small white square with black X in top-right
        strategies = [
            lambda: page.locator('[aria-label="Close"]').first.click(timeout=2000),
            lambda: page.locator('[aria-label="close"]').first.click(timeout=2000),
            lambda: page.get_by_role("button", name=re.compile(r"close|dismiss|×|\bx\b", re.I)).first.click(timeout=2000),
            lambda: page.get_by_text("×", exact=True).first.click(timeout=2000),
            lambda: page.locator('button[class*="close"], [class*="close"]').first.click(timeout=2000),
            lambda: page.locator('.modal-close, [data-dismiss="modal"]').first.click(timeout=2000),
            # X icon (SVG or image) with close semantics
            lambda: page.locator('[title="Close"], [title="close"], svg[aria-label="Close"]').first.click(timeout=2000),
            # Any clickable inside overlay that looks like close (× or single X)
            lambda: page.locator('[class*="overlay"]').filter(has_text="ECO IMPACT").get_by_text("×", exact=True).first.click(timeout=2000),
            lambda: page.locator('[class*="overlay"]').filter(has_text="ECO IMPACT").locator("button").first.click(timeout=2000),
            lambda: page.locator('[class*="modal"]').filter(has_text="ECO IMPACT").locator("button").first.click(timeout=2000),
        ]
        for try_click in strategies:
            try:
                try_click()
                page.wait_for_timeout(500)
                return
            except Exception:
                continue
        # Fallback: Escape often closes modals/overlays
        try:
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
        except Exception:
            pass

    def _manual_scroll_page(self, page):
        """Scroll to bottom of page (to unfreeze / trigger lazy load), then back up so job list is in view. Logs heights for troubleshooting."""
        # Use max of body and documentElement; some pages pin height to one or the other
        try:
            full_height = page.evaluate(
                "() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight, document.documentElement.offsetHeight)"
            )
            scraper_log(f"\tEcoCanada: page scroll height = {full_height}")
        except Exception as e:
            scraper_log(f"\tEcoCanada: could not get scroll height: {e}")
            full_height = 4000
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(400)
        # Scroll down to bottom in steps to "wake up" a frozen or lazy page (cap steps for safety)
        step_px = 600
        max_steps = min(25, max(1, (int(full_height) // step_px) + 1))
        for _ in range(max_steps):
            page.evaluate(f"window.scrollBy(0, {step_px})")
            page.wait_for_timeout(200)
            try:
                at_bottom = page.evaluate(
                    "() => window.scrollY + window.innerHeight >= Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - 50"
                )
                if at_bottom:
                    break
            except Exception:
                pass
        # Force to bottom then wait so any lazy content loads
        try:
            page.evaluate(f"window.scrollTo(0, {full_height})")
        except Exception:
            pass
        page.wait_for_timeout(1500)
        try:
            y = page.evaluate("window.scrollY")
            scraper_log(f"\tEcoCanada: scrolled to bottom (Y={y}), scrolling back up to job list area")
        except Exception:
            pass
        # Scroll back up so job list / filter area is in view
        page.evaluate("window.scrollTo(0, 1400)")
        page.wait_for_timeout(600)
        if os.environ.get("ECO_DEBUG_SCREENSHOT"):
            self.upload_error_screenshot_from_page(page, "ecocanada-after-scroll")

    def open_listings_page(self, page, filter_value=None):
        scraper_log("\tEcoCanada: viewport 1280x1400")
        scraper_log(f"self.source['url'] {self.source['url']}")
        page.goto(self.source["url"], wait_until="domcontentloaded")
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        self._accept_consent_popup(page)
        self._dismiss_overlay(page)
        page.wait_for_timeout(500)
        self._manual_scroll_page(page)

        if filter_value:
            try:
                joblist = page.locator("#joblist")
                joblist.scroll_into_view_if_needed(timeout=10000)
            except Exception:
                pass
            page.wait_for_timeout(800)
            try:
                view_btn = page.get_by_role("link", name="View Available Jobs")
                if view_btn.count() > 0:
                    view_btn.first.click()
                    page.wait_for_timeout(1500)
            except Exception:
                pass
            self.filter_jobs(page, filter_value)

    def has_next_page(self, page):
        return self.page_count > 1 and self.current_page_number < self.page_count

    def go_next_page(self, page):
        self.try_next_page()
