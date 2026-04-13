from scrapers.base import BaseScraper
from utils.normalize import normalize_job_data
from utils.extractors import extract_salary_from_text
import re


class CentraideScraper(BaseScraper):
    is_chronological = True
    language = "fr"
    job_wait_selector = "section.single-main .entry-content"

    def get_listing_items(self, page):
        sel = "section.block-career a.career__global__link"
        try:
            page.wait_for_selector(sel, timeout=10000)
            return page.locator(sel)
        except Exception:
            try:
                page.wait_for_selector("a.career__global__link", timeout=8000)
                return page.locator("a.career__global__link")
            except Exception:
                return page.locator("a[href*='/carrieres/'], a[href*='/carriere/'], a[href*='offre-']")

    def get_listing_data(self, item):
        data = {}
        try:
            title_loc = item.locator(".career--inner").first
            if title_loc.count() > 0:
                data["job_title"] = title_loc.inner_text().strip()
        except Exception:
            pass
        try:
            time_loc = item.locator(".career--date time").first
            if time_loc.count() > 0:
                data["date_posted"] = time_loc.inner_text().strip()
        except Exception:
            pass
        try:
            loc_terms = item.locator(".career--localisation--terms").first
            if loc_terms.count() > 0:
                txt = loc_terms.inner_text().strip()
                if txt:
                    data["location"] = txt
        except Exception:
            pass
        return data

    def get_job_url(self, item):
        try:
            href = item.get_attribute("href", timeout=1000)
        except Exception:
            return None
        if not href:
            return None
        return href if href.startswith("http") else self.build_full_url(href)

    # ---- Field extraction ----

    def extract_date_posted(self, page, listing_data):
        date = self.extract_meta_date(page)
        if date:
            return date
        try:
            text = page.inner_text()
            m = re.search(r"Publié le\s*(\d{1,2}\s+[A-Za-zéûàèÎû\-]+\s+\d{4})", text, re.I)
            if m:
                return m.group(1)
            m2 = re.search(r"Posted[:\s]*([A-Za-z0-9, \-]+\d{4})", text, re.I)
            if m2:
                return m2.group(1)
        except Exception:
            pass
        return None

    def extract_job_title(self, page, listing_data):
        try:
            return page.locator("h1, h2").first.inner_text().strip()
        except Exception:
            try:
                return page.title().strip()
            except Exception:
                return "Unknown"

    def extract_description(self, page, listing_data):
        for sel in ["section.single-main .entry-content", ".entry-content", "article", "#content"]:
            try:
                loc = page.locator(sel).first
                if loc.count() >= 1:
                    try:
                        page.eval_on_selector(sel, "el => { el.querySelectorAll('table').forEach(t=>t.remove()); }")
                    except Exception:
                        pass
                    text = loc.inner_text()
                    if text and text.strip():
                        return text
            except Exception:
                continue
        try:
            return page.content()
        except Exception:
            return ""

    def extract_location(self, page, listing_data):
        return "Montreal, QC"

    def extract_organization(self, page, listing_data):
        return (self.source or {}).get("name") or "Centraide Montreal"

    def extract_employment_type(self, page, listing_data):
        try:
            text = (page.locator("section.single-main .entry-content").first.inner_text() or "").lower()
            if "bénévole" in text:
                return "volunteer"
        except Exception:
            pass
        return None

    def extract_wage(self, page, listing_data):
        try:
            text = page.locator("section.single-main .entry-content").first.inner_text() or ""
            return extract_salary_from_text(text)
        except Exception:
            pass
        return None
