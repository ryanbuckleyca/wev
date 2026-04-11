from scrapers.base import BaseScraper
from utils.log import scraper_log
from utils.normalize import normalize_job_data
from utils.extractors import extract_salary_from_text


class CSIScraper(BaseScraper):
    is_chronological = True
    listing_selector = "h4.elementor-heading-title a"
    job_wait_selector = "h2.elementor-heading-title"

    SELECTORS = {
        "description": "[data-widget_type='theme-post-content.default']",
    }

    def __init__(self, source):
        super().__init__(source)
        self.load_more_available = True
        self.processed_urls = set()

    def start_browser(self, headless=True, viewport=None):
        return super().start_browser(headless=headless, viewport={"width": 1280, "height": 1400})

    def setup_pagination(self, page):
        self.load_more_available = True

    def get_job_url(self, item):
        try:
            job_url = item.get_attribute("href")
            if not job_url or job_url == "https://socialinnovation.org":
                return None
            if job_url in self.processed_urls:
                return None
            self.processed_urls.add(job_url)
            return job_url
        except Exception:
            return None

    def get_listing_data(self, item):
        data = {}
        try:
            parent = item.locator("xpath=ancestor::div[contains(@class, 'elementor-widget-wrap')]").first
            icon_items = parent.locator(".elementor-icon-list-item").all()
            for icon_item in icon_items:
                try:
                    sr_only = icon_item.locator(".sr-only-text").inner_text().strip()
                except Exception:
                    sr_only = ""
                try:
                    full_text = icon_item.locator(".elementor-icon-list-text").inner_text().strip()
                except Exception:
                    full_text = icon_item.inner_text().strip()

                if "Contract Type:" in sr_only:
                    data["employment_type"] = full_text.replace("Contract Type:", "").strip()
                elif "Location:" in sr_only:
                    data["location"] = full_text.replace("Location:", "").strip()
                elif "Hosted by:" in sr_only:
                    data["organization"] = full_text.replace("Hosted by:", "").strip()
        except Exception as e:
            scraper_log(f"\t\tWarning: Could not extract listing data: {e}")
        return data

    def open_listings_page(self, page, filter_value=None):
        self.load_more_available = True
        self.processed_urls = set()
        page.goto(self.source["url"])

    def has_next_page(self, page):
        return self.load_more_available

    def go_next_page(self, page):
        try:
            load_more_locator = page.locator("button:has-text('Load More')")
            if load_more_locator.count() == 0:
                self.load_more_available = False
                self.should_quit_list = True
                return
            load_more_button = load_more_locator.first
            if load_more_button.is_enabled(timeout=3000):
                load_more_button.scroll_into_view_if_needed()
                load_more_button.click(timeout=5000)
                page.wait_for_timeout(2000)
                self.load_more_available = True
            else:
                self.load_more_available = False
                self.should_quit_list = True
        except Exception as e:
            scraper_log(f"No more jobs to load: {e}")
            self.load_more_available = False
            self.should_quit_list = True

    # ---- Field extraction ----

    def extract_date_posted(self, page, listing_data):
        try:
            meta = page.locator(
                'meta[property="article:published_time"], '
                'meta[property="article:modified_time"]'
            ).first
            content = meta.get_attribute("content")
            if content:
                return content
        except Exception:
            pass
        try:
            return page.locator(".post-date, .date-posted").inner_text(timeout=3000).strip()
        except Exception:
            return None

    def extract_job_title(self, page, listing_data):
        try:
            return page.locator("h2.elementor-heading-title.elementor-size-default").inner_text().strip()
        except Exception:
            try:
                return page.locator("h2.elementor-heading-title").inner_text().strip()
            except Exception:
                return None

    def extract_wage(self, page, listing_data):
        """Extract wage from icon-list on the job detail page."""
        try:
            icon_list = page.locator("[data-widget_type='icon-list.default']")
            icon_list.first.wait_for(timeout=3000)
            for item in icon_list.locator(".elementor-icon-list-item").all():
                try:
                    full_text = item.locator(".elementor-icon-list-text").inner_text(timeout=2000).strip()
                except Exception:
                    full_text = item.inner_text(timeout=2000).strip()
                if "$" in full_text or "salary" in full_text.lower() or "Compensation:" in full_text:
                    raw = full_text.split(":", 1)[-1].strip() if ":" in full_text else full_text
                    return extract_salary_from_text(raw) or raw
        except Exception:
            pass
        return None
