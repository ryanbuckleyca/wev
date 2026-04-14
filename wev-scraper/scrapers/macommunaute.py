import re

from scrapers.base import BaseScraper, _is_ci
from utils.extractors import extract_salary_from_text
from utils.log import scraper_log


class MaCommunauteScraper(BaseScraper):
    """Scraper for macommunaute.ca — handles both /emplois/ and /benevolat/ URLs.

    The listing page is JS-rendered; each card contains date, location, title,
    organization, and a "Consulter" link to the detail page.
    Pagination follows WordPress-style /page/N/ URLs.
    """

    is_chronological = True
    language = "fr"
    listing_selector = ".card-posts a.card-post"
    job_wait_selector = ".entry-content, .single-content, article"

    def setup_pagination(self, page):
        try:
            # Find the highest page number from the numeric pagination links
            links = page.locator(".page-numbers a, nav.navigation a").all()
            page_numbers = []
            for link in links:
                href = link.get_attribute("href") or ""
                m = re.search(r"/page/(\d+)/?$", href)
                if m:
                    page_numbers.append(int(m.group(1)))
            self.page_count = max(page_numbers) if page_numbers else 1
        except Exception as e:
            scraper_log(f"\tMaCommunaute: could not determine page count ({e})")
            self.page_count = 1

    def has_next_page(self, page):
        # DOM "next" link is the single source of truth — more reliable than a
        # pre-computed page_count which can be stale or miscounted on the last page.
        return page.locator("a.next.page-numbers, .page-numbers a[rel='next']").count() > 0

    def go_next_page(self, page):
        next_num = self.current_page_number + 1
        base = self.source["url"].rstrip("/")
        next_url = f"{base}/page/{next_num}/"
        self._goto_with_networkidle(page, next_url)
        self.current_page_number += 1
        self.setup_pagination(page)

    def get_job_url(self, item):
        # Each listing item IS the <a> tag
        try:
            href = item.get_attribute("href")
            if href:
                return href if href.startswith("http") else self.build_full_url(href)
        except Exception:
            pass
        return None

    def get_listing_data(self, item):
        """Extract date, location, title, and organization from the listing card."""
        data = {}
        try:
            # "12 mars 2026 • <i>Montréal</i>" — strip the location part to get just the date
            date_text = item.locator(".date").inner_text().strip()
            # Everything before the bullet is the date
            data["date_posted"] = date_text.split("•")[0].strip()
        except Exception:
            pass

        try:
            data["location"] = item.locator(".date i").inner_text().strip()
        except Exception:
            pass

        try:
            data["job_title"] = item.locator("h3").inner_text().strip()
        except Exception:
            pass

        try:
            data["organization"] = item.locator(".auteur").inner_text().strip()
        except Exception:
            pass

        return data

    # ---- Detail page field extraction ----

    def extract_date_posted(self, page, listing_data):
        # Meta tag is most reliable; fall back to the date captured from the listing card
        return self.extract_meta_date(page) or listing_data.get("date_posted")

    def extract_job_title(self, page, listing_data):
        for sel in ["h1.entry-title", "h1", "h2"]:
            try:
                loc = page.locator(sel).first
                if loc.count() > 0:
                    txt = loc.inner_text().strip()
                    if txt:
                        return txt
            except Exception:
                continue
        return listing_data.get("job_title") or "Unknown"

    def extract_description(self, page, listing_data):
        for sel in [".post-content", ".entry-content", ".single-content"]:
            try:
                loc = page.locator(sel).first
                if loc.count() > 0:
                    text = loc.inner_text()
                    if text and text.strip():
                        text = text.strip()
                        # Strip the breadcrumb/share bar that appears at the top of
                        # bénévolat pages: "Accueil » … OPPORTUNITÉ DE BÉNÉVOLAT …"
                        for marker in ("OPPORTUNITÉ DE BÉNÉVOLAT", "OFFRE D'EMPLOI", "OPPORTUNITÉ D'EMPLOI"):
                            if marker in text:
                                text = text.split(marker, 1)[-1].strip()
                                break
                        return text
            except Exception:
                continue
        return None

    def extract_organization(self, page, listing_data):
        # The organization is shown in the listing card; use it if available
        if listing_data.get("organization"):
            return listing_data["organization"]
        # Try the detail page sidebar/meta
        for sel in [".organization", ".company", "[class*='org']", ".author"]:
            try:
                loc = page.locator(sel).first
                if loc.count() > 0:
                    txt = loc.inner_text().strip()
                    if txt:
                        return txt
            except Exception:
                continue
        return None

    def extract_location(self, page, listing_data):
        if listing_data.get("location"):
            return listing_data["location"]
        return None

    def extract_employment_type(self, page, listing_data):
        # Check if this is a volunteer source (/benevolat/)
        url = self.source.get("url", "")
        if "benevolat" in url:
            return "volunteer"
        # Try to detect from the detail page meta block
        try:
            meta_text = page.locator(".job-meta, .entry-meta, aside, .sidebar").first.inner_text()
            meta_lower = meta_text.lower()
            if "temps plein" in meta_lower:
                return "full-time"
            if "temps partiel" in meta_lower:
                return "part-time"
            # "poste contractuel" or "emploi contractuel" = fixed-term contract
            if re.search(r"(?:poste|emploi)\s+contractuel", meta_lower):
                return "contract"
            if "bénévol" in meta_lower or "benevol" in meta_lower:
                return "volunteer"
        except Exception:
            pass
        # Fall back to scanning the full page text
        try:
            text = page.locator("article, .entry-content").first.inner_text().lower()
            if "temps plein" in text:
                return "full-time"
            if "temps partiel" in text:
                return "part-time"
            if re.search(r"(?:poste|emploi)\s+contractuel", text):
                return "contract"
        except Exception:
            pass
        return None

    def extract_wage(self, page, listing_data):
        try:
            text = page.locator(".post-content, .entry-content, article").first.inner_text()
            return extract_salary_from_text(text)
        except Exception:
            pass
        return None

    def start_browser(self, headless=True, viewport=None):
        """Launch browser with proxy in CI (needed for Cloudflare bypass)."""
        return super().start_browser(headless=headless, viewport=viewport, use_proxy=_is_ci())
