import re

from scrapers.base import BaseScraper
from utils.extractors import extract_salary_from_text
from utils.log import scraper_log

_LISTING_URLS = {
    "Toronto, ON": (
        "https://www.charityvillage.com/jobs?geo_location=Toronto%2C+ON"
        "&lon=-79.347015&lat=43.65107&radius=25&locality=Toronto%2C+ON"
        "&locationType=locality"
    ),
    "Montreal, QC": (
        "https://www.charityvillage.com/jobs?geo_location=Montr%C3%A9al%2C+QC"
        "&lon=-73.567256&lat=45.501689&radius=25&locality=Montr%C3%A9al%2C+QC"
        "&locationType=locality"
    ),
}

_NEXT_PAGE_PATTERN = re.compile(r"next", re.IGNORECASE)

_EMPLOYMENT_TYPE_KEYWORDS = [
    "full-time", "full time", "part-time", "part time",
    "contract", "temporary", "volunteer", "internship",
    "seasonal", "casual", "permanent",
]


class CharityVillageScraper(BaseScraper):
    is_chronological = True
    filter_values = ["Toronto, ON", "Montreal, QC"]
    listing_selector = "div[data-testid='jcl-job-teaser-wrapper']"
    job_wait_selector = "div[data-testid='job-detail-wrapper']"

    def __init__(self, source):
        super().__init__(source)
        self.current_page_number = 1

    def get_listings_url(self, filter_value=None):
        return _LISTING_URLS.get(filter_value, "https://www.charityvillage.com/jobs")

    def open_listings_page(self, page, filter_value=None):
        url = self.get_listings_url(filter_value)
        scraper_log(f"\nNavigating to {url}")
        self._goto_with_networkidle(page, url)
        page.wait_for_timeout(3000)
        self._listings_base_url = page.url

    def has_next_page(self, page) -> bool:
        try:
            count = page.locator(self.listing_selector).count()
            if count == 0:
                return False
            return self._find_next_element(page) is not None
        except Exception as e:
            scraper_log(f"\tCharityVillage: error checking for next page: {e}")
            return False

    def go_next_page(self, page):
        self.current_page_number += 1
        next_el = self._find_next_element(page)
        if next_el:
            try:
                with page.expect_navigation():
                    next_el.click()
                page.wait_for_timeout(3000)
                return
            except Exception as e:
                scraper_log(f"\tCharityVillage: error clicking next: {e}")
        next_url = self._build_page_url(page)
        try:
            self._goto_with_networkidle(page, next_url)
            page.wait_for_timeout(3000)
        except Exception as e:
            scraper_log(f"\tCharityVillage: error going to page {self.current_page_number}: {e}")
            self.should_quit_list = True

    def _find_next_element(self, page):
        try:
            btn = page.get_by_role("button", name=_NEXT_PAGE_PATTERN)
            if btn.count() > 0 and not btn.first.is_disabled():
                return btn.first
            link = page.get_by_role("link", name=_NEXT_PAGE_PATTERN)
            if link.count() > 0:
                return link.first
            li = page.locator("li.next:not(.disabled), li:has-text('Next'):not(.disabled)")
            if li.count() > 0:
                a = li.locator("a")
                return a.first if a.count() > 0 else li.first
        except Exception:
            pass
        return None

    def _build_page_url(self, page) -> str:
        base = getattr(self, "_listings_base_url", page.url)
        base = re.sub(r"[&?]page=\d+", "", base)
        sep = "&" if "?" in base else "?"
        return f"{base}{sep}page={self.current_page_number}"

    def extract_job_title(self, page, listing_data) -> str:
        return self._extract_text(page, "[data-testid='title']") or listing_data.get("job_title", "Unknown")

    def extract_organization(self, page, listing_data) -> str | None:
        return self._extract_text(page, "[data-testid='company-name']")

    def extract_description(self, page, listing_data) -> str | None:
        return self._extract_text(page, "[data-testid='job-detail-description']")

    def extract_location(self, page, listing_data) -> str | None:
        return listing_data.get("teaser_location")

    def extract_wage(self, page, listing_data) -> str | None:
        fields = self._extract_text(page, "[data-testid='fields-values']")
        if fields:
            return extract_salary_from_text(fields)
        return None

    def extract_date_posted(self, page, listing_data) -> str | None:
        return listing_data.get("date_posted")

    def extract_close_date(self, page, listing_data) -> str | None:
        return listing_data.get("close_date")

    def extract_employment_type(self, page, listing_data) -> str | None:
        fields = self._extract_text(page, "[data-testid='fields-values']")
        if fields:
            for part in fields.split("|"):
                part = part.strip()
                lower = part.lower()
                if any(kw in lower for kw in _EMPLOYMENT_TYPE_KEYWORDS):
                    return part
        return None

    def get_listing_data(self, item) -> dict:
        data = {}
        try:
            loc = item.locator("[data-testid='jcl-job-teaser-location']")
            if loc.count() > 0:
                data["teaser_location"] = loc.inner_text().strip()

            text = item.inner_text()
            if "Fully Remote" in text:
                data["remote_status"] = "Fully Remote"
            elif "Hybrid" in text:
                data["remote_status"] = "Hybrid"

            pub_match = re.search(r"Published:\s*(\d{4}-\d{2}-\d{2})", text)
            if pub_match:
                data["date_posted"] = pub_match.group(1)
            exp_match = re.search(r"Expires:\s*(\d{4}-\d{2}-\d{2})", text)
            if exp_match:
                data["close_date"] = exp_match.group(1)
        except Exception:
            pass
        return data

    def _extract_text(self, page, selector: str) -> str | None:
        try:
            return page.locator(selector).first.inner_text().strip()
        except Exception:
            return None
