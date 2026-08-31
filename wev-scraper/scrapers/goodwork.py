import os
import re

from scrapers.base import BaseScraper
from utils.extractors import (
    extract_labeled_value,
    extract_labeled_value_from_text,
    extract_salary_from_text,
    extract_title_from_blocks,
)
from utils.log import scraper_log

MAX_PAGES = 50  # guard against infinite pagination loops
DATE_POSTED_PATTERN = re.compile(
    r"Date posted:\s*([A-Za-z]{3}\s+\d{1,2}\s+\d{4})", re.IGNORECASE
)
TITLE_LABELS = ["Position:", "Role:", "Hiring:"]
LOCATION_LABELS = ["Location:", "Work Location:", "Work location:"]
ORG_LABELS = ["Organization:", "Company:", "Farm:", "Employer:", "Business:"]
WAGE_LABEL_PATTERNS = [
    ("Salary:", r"Salary:\s*(.+?)(?:\n|$)"),
    ("Compensation", r"Compensation\s*:\s*(.+?)(?:\n|$)"),
    ("Compensation:", r"Compensation:\s*(.+?)(?:\n|$)"),
]


class GoodWorkScraper(BaseScraper):
    is_chronological = True
    listing_selector = ".listingthumb.row"
    job_wait_selector = "h2, h3"

    # setup_pagination is intentionally a no-op: page_count is not used here.
    # Pagination is driven entirely by has_next_page / go_next_page.

    def get_listings_url(self, filter_value=None):
        return "https://www.goodwork.ca/jobs.php"

    def open_listings_page(self, page, filter_value=None):
        self._goto_with_networkidle(page, self.get_listings_url())
        # Store the listings URL so go_next_page can paginate from the right base
        self._listings_base_url = page.url

    def has_next_page(self, page):
        """Keep paginating as long as listings exist and we haven't hit the safety cap.

        GoodWork uses a sliding pagination window so visible page-number links
        don't reflect the true total — we try the next page and stop when empty.
        """
        if self.current_page_number >= MAX_PAGES:
            scraper_log(f"\tGoodWork: reached max page limit ({MAX_PAGES}), stopping")
            return False
        try:
            count = page.locator(self.listing_selector).count()
            if count == 0:
                scraper_log(f"\tGoodWork: no listings on page {self.current_page_number}, stopping pagination")
                return False
            return True
        except Exception as e:
            scraper_log(f"\tGoodWork: error checking for next page: {e}")
            return False

    def go_next_page(self, page):
        next_page_num = self.current_page_number + 1
        next_url = self._build_page_url(next_page_num)
        scraper_log(f"\tGoodWork: navigating to page {next_page_num} → {next_url}")
        page.goto(next_url, wait_until="domcontentloaded")
        self.current_page_number += 1
        try:
            page.wait_for_selector(self.listing_selector, timeout=5_000)
        except Exception:
            scraper_log(f"\tGoodWork: no listings on page {next_page_num}, stopping pagination")
            self.should_quit_list = True

    def fetch_jobs(self, headless=True):
        """Override to apply LLM-based location extraction after scraping."""
        jobs = super().fetch_jobs(headless)
        if not jobs:
            return jobs
        # In plain dry-run we skip the LLM; in compare-only mode we run it so that
        # comparisons against existing DB rows include the full location pipeline.
        if os.environ.get("DRY_RUN") == "1" and os.environ.get("COMPARE_ONLY") != "1":
            scraper_log(f"\nDRY RUN: skipping LLM location extraction for {len(jobs)} jobs")
            return jobs
        scraper_log(f"\nExtracting locations using LLM for {len(jobs)} jobs...")
        try:
            from utils.llm_location_extractor import extract_locations_for_jobs
            extract_locations_for_jobs(jobs)
            scraper_log("Location extraction complete.")
        except Exception as e:
            scraper_log(f"Error during LLM location extraction: {e}")
        return jobs

    # ---- Field extraction ----

    def extract_job_title(self, page, listing_data):
        blocks = page.locator("xpath=//p[strong]").all_inner_texts()
        title = extract_title_from_blocks(blocks, TITLE_LABELS)
        if not title:
            title = self._search_text_for_label(page, TITLE_LABELS)
        if not title:
            try:
                title = page.locator("h2").first.inner_text().strip()
            except Exception:
                pass
        return title or "Unknown"

    def extract_date_posted(self, page, listing_data):
        # Try the footer row first (more specific), then fall back to full page text
        for get_text in (self._get_footer_text, self._get_page_text):
            text = get_text(page)
            if text:
                match = DATE_POSTED_PATTERN.search(text)
                if match:
                    return match.group(1)
        return None

    def extract_location(self, page, listing_data):
        location = self._extract_labeled_field(page, LOCATION_LABELS)
        if not location:
            scraper_log("\t\tNotice: Could not locate location for this posting.")
        return location

    def extract_wage(self, page, listing_data):
        wage = (
            self._extract_wage_from_strong(page)
            or self._extract_wage_from_paragraphs(page)
            or self._extract_wage_from_page_text(page)
        )
        return wage or "N/A"

    def extract_organization(self, page, listing_data):
        return self._extract_labeled_field(page, ORG_LABELS)

    def extract_description(self, page, listing_data):
        try:
            data = self.extract_with_selectors(page, {"description": "#page .row div"})
            return (data.get("description") or "").strip()
        except Exception:
            return ""

    # ---- Private helpers ----

    def _build_page_url(self, page_num: int) -> str:
        """Build a paginated URL by replacing or appending the page= param."""
        base = getattr(self, "_listings_base_url", self.source["url"])
        base = re.sub(r"[&?]page=\d+", "", base).rstrip("&").rstrip("?")
        sep = "&" if "?" in base else "?"
        return f"{base}{sep}page={page_num}"

    def _get_strong_blocks(self, page) -> list[str]:
        return page.locator("xpath=//p[strong]").all_inner_texts()

    def _get_first_div_text(self, page) -> str | None:
        try:
            return page.locator("#page").locator(".row").locator("div").first.inner_text()
        except Exception:
            return None

    def _get_footer_text(self, page) -> str | None:
        try:
            return page.locator("#page").locator(".row").last.inner_text(timeout=5000).strip()
        except Exception:
            return None

    def _get_page_text(self, page) -> str | None:
        try:
            return page.locator("#page").inner_text()
        except Exception:
            return None

    def _extract_labeled_field(self, page, labels: list[str]) -> str | None:
        """Extract a labeled field from strong blocks, falling back to first div text."""
        blocks = self._get_strong_blocks(page)
        value = extract_labeled_value(blocks, labels)
        if not value:
            text = self._get_first_div_text(page)
            if text:
                value = extract_labeled_value_from_text(text, labels)
        return value

    def _search_text_for_label(self, page, labels: list[str]) -> str | None:
        """Regex-search the first div text for any of the given labels."""
        text = self._get_first_div_text(page)
        if not text:
            return None
        label_pattern = "|".join(re.escape(lbl.rstrip(":")) for lbl in labels)
        match = re.search(rf"(?:{label_pattern}):\s*(.+?)(?:\n|$)", text)
        return match.group(1).strip() if match else None

    def _extract_wage_from_strong(self, page) -> str | None:
        """Strategy 1: explicit 'Wage:' label inside a <strong> tag."""
        try:
            wage_locator = page.locator("strong", has_text="Wage:").locator("xpath=..")
            texts = wage_locator.all_inner_texts()
            if texts:
                raw = texts[0].split("Wage:")[1].strip().split("\n")[0].strip()
                return extract_salary_from_text(raw)
        except Exception:
            pass
        return None

    def _extract_wage_from_paragraphs(self, page) -> str | None:
        """Strategy 2: 'Salary:' or 'Compensation' inside paragraph strong blocks."""
        try:
            blocks = self._get_strong_blocks(page)
            for block in blocks:
                for label, pattern in WAGE_LABEL_PATTERNS:
                    if label in block:
                        m = re.search(pattern, block, re.IGNORECASE)
                        if m:
                            raw = m.group(1).strip().split("\n")[0].strip()
                            wage = extract_salary_from_text(raw)
                            if wage:
                                return wage
        except Exception:
            pass
        return None

    def _extract_wage_from_page_text(self, page) -> str | None:
        """Strategy 3: scan full page text for any salary pattern."""
        text = self._get_first_div_text(page) or self._get_page_text(page)
        return extract_salary_from_text(text) if text else None
