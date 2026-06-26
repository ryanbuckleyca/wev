import re
from scrapers.base import BaseScraper
from utils.log import scraper_log

class CharityVillageScraper(BaseScraper):
    is_chronological = True
    filter_values = ["Toronto, ON", "Montreal, QC"]
    listing_selector = "div[data-testid='jcl-job-teaser-wrapper']"
    job_wait_selector = "div[data-testid='job-detail-wrapper']"
    
    def get_listings_url(self, filter_value=None):
        if filter_value == "Toronto, ON":
            return "https://www.charityvillage.com/jobs?geo_location=Toronto%2C+ON&lon=-79.347015&lat=43.65107&radius=25&locality=Toronto%2C+ON&locationType=locality"
        elif filter_value == "Montreal, QC":
            return "https://www.charityvillage.com/jobs?geo_location=Montr%C3%A9al%2C+QC&lon=-73.567256&lat=45.501689&radius=25&locality=Montr%C3%A9al%2C+QC&locationType=locality"
        return "https://www.charityvillage.com/jobs"

    def open_listings_page(self, page, filter_value=None):
        url = self.get_listings_url(filter_value)
        scraper_log(f"\nNavigating to {url}")
        self._goto_with_networkidle(page, url)
        page.wait_for_timeout(3000)
        self._listings_base_url = page.url

    def has_next_page(self, page):
        # Look for pagination "next" button or if there are any jobs on the current page
        count = page.locator(self.listing_selector).count()
        if count == 0:
            return False
            
        # Standard pagination: look for next arrow/button
        # Often it's a link with aria-label="Next page" or similar. We can check if it exists and is not disabled.
        # Without exact DOM, we can try generic pagination, but since we don't have it, we'll try to find an enabled "Next" link or return False if we're only doing 3 jobs anyway.
        # We will inspect during dry-run.
        try:
            next_btn = page.get_by_role("button", name=re.compile(r"next", re.IGNORECASE))
            if next_btn.count() > 0 and not next_btn.first.is_disabled():
                return True
                
            next_link = page.get_by_role("link", name=re.compile(r"next", re.IGNORECASE))
            if next_link.count() > 0:
                return True
                
            # If standard roles fail, check for li.next or similar
            next_li = page.locator("li.next:not(.disabled), li:has-text('Next'):not(.disabled)")
            if next_li.count() > 0:
                return True
        except Exception:
            pass
            
        return False

    def go_next_page(self, page):
        self.current_page_number += 1
        # For simplicity without exact pagination selector, try finding 'Next' button
        try:
            next_btn = page.get_by_role("button", name=re.compile(r"next", re.IGNORECASE))
            if next_btn.count() > 0 and not next_btn.first.is_disabled():
                with page.expect_navigation():
                    next_btn.first.click()
                return
                
            next_link = page.get_by_role("link", name=re.compile(r"next", re.IGNORECASE))
            if next_link.count() > 0:
                with page.expect_navigation():
                    next_link.first.click()
                return
                
            next_li = page.locator("li.next:not(.disabled) a, li:has-text('Next'):not(.disabled) a")
            if next_li.count() > 0:
                with page.expect_navigation():
                    next_li.first.click()
                return
                
            # Fallback URL construction if we can't click
            base = getattr(self, "_listings_base_url", page.url)
            base = re.sub(r"[&?]page=\d+", "", base)
            sep = "&" if "?" in base else "?"
            next_url = f"{base}{sep}page={self.current_page_number}"
            page.goto(next_url, wait_until="domcontentloaded")
            
        except Exception as e:
            scraper_log(f"\tCharityVillage: error going to next page: {e}")
            self.should_quit_list = True

    # --- Field Extraction Methods ---

    def extract_job_title(self, page, listing_data):
        return self._extract_text(page, "[data-testid='title']") or listing_data.get("job_title", "Unknown")

    def extract_organization(self, page, listing_data):
        return self._extract_text(page, "[data-testid='company-name']")

    def extract_description(self, page, listing_data):
        return self._extract_text(page, "[data-testid='job-detail-description']")

    def extract_location(self, page, listing_data):
        if "teaser_location" in listing_data:
            return listing_data["teaser_location"]
        return None

    def extract_wage(self, page, listing_data):
        fields = self._extract_text(page, "[data-testid='fields-values']")
        if fields:
            parts = [p.strip() for p in fields.split("|")]
            for part in parts:
                if "$" in part or "per year" in part or "per hour" in part:
                    return part
        return None

    def extract_date_posted(self, page, listing_data):
        return listing_data.get("date_posted")

    def extract_close_date(self, page, listing_data):
        return listing_data.get("close_date")

    def extract_employment_type(self, page, listing_data):
        fields = self._extract_text(page, "[data-testid='fields-values']")
        if fields:
            parts = [p.strip() for p in fields.split("|")]
            if len(parts) >= 2:
                # E.g. Fundraising / Giving | Full Time | $80,000 - $90,000 per year
                # Ignore the category, grab the job type
                return parts[1]
        
        # Fallback to looking near Apply button
        try:
            btn = page.locator("[data-testid='job-apply-submit-button']")
            if btn.count() > 0:
                job_type = btn.evaluate('''el => {
                    let current = el;
                    let prev = el.previousElementSibling;
                    while (!prev && current.parentElement) {
                        current = current.parentElement;
                        prev = current.previousElementSibling;
                    }
                    if (prev) {
                        return prev.innerText.trim();
                    }
                    return null;
                }''')
                if job_type:
                    lines = [l.strip() for l in job_type.split("\\n") if l.strip()]
                    if lines:
                        return lines[-1]
        except Exception:
            pass
            
        if "remote_status" in listing_data:
            return listing_data["remote_status"]
            
        return None

    # --- Listing Extraction Methods ---
    def get_job_url(self, item):
        try:
            href = item.locator("a").first.get_attribute("href")
            if href:
                return self.build_full_url(href) if not href.startswith("http") else href
        except Exception:
            pass
        return None

    def build_full_url(self, path: str) -> str:
        base = "https://www.charityvillage.com"
        return f"{base}{path}" if path.startswith("/") else f"{base}/{path}"

    def get_listing_data(self, item):
        data = {}
        try:
            # We can grab title, location, remote, dates right from the teaser
            wrapper = item.locator("xpath=ancestor::div[@title]").first
            if wrapper.count() > 0:
                data["job_title"] = wrapper.get_attribute("title")
            
            loc = item.locator("[data-testid='jcl-job-teaser-location']")
            if loc.count() > 0:
                data["teaser_location"] = loc.inner_text().strip()
                
            text = item.inner_text()
            if "Fully Remote" in text:
                data["remote_status"] = "Fully Remote"
            elif "Hybrid" in text:
                data["remote_status"] = "Hybrid"
                
            if "Published:" in text:
                pub_match = re.search(r"Published:\s*(\d{4}-\d{2}-\d{2})", text)
                if pub_match:
                    data["date_posted"] = pub_match.group(1)
            if "Expires:" in text:
                exp_match = re.search(r"Expires:\s*(\d{4}-\d{2}-\d{2})", text)
                if exp_match:
                    data["close_date"] = exp_match.group(1)
        except Exception:
            pass
        return data

    def _extract_text(self, page, selector: str) -> str:
        try:
            return page.locator(selector).first.inner_text().strip()
        except Exception:
            return None
