"""Cooperation Canada careers board scraper.

Board: https://cooperation.ca/careers/ (also served from the Kinsta staging host).
Custom post type ``tw_job`` — listing cards (``article.card-tw_job``) already
carry title, employment type, published/closing dates, and hiring org. Detail
pages expose structured ``#tw_job-*`` fields plus a free-form ``.post-content``.
"""

from __future__ import annotations

import re

from scrapers.base import BaseScraper
from utils.extractors import (
    extract_labeled_value_from_text,
    extract_salary_from_text,
    first_nonempty,
)

_CAREERS_HREF = re.compile(r"/careers/[^/?#]+", re.IGNORECASE)
_LOCATION_LABELS = ["Location:", "Location"]
_SALARY_LABELS = ["Salary:", "Salary"]


class CooperationCanadaScraper(BaseScraper):
    is_chronological = True
    listing_selector = "article.card-tw_job"
    job_wait_selector = "h1.uk-article-title, #tw_job-details, .post-content"

    def get_job_url(self, item):
        """Prefer the title/image link into /careers/<slug>/, not the org website."""
        try:
            links = item.locator("a[href]")
            for i in range(links.count()):
                href = links.nth(i).get_attribute("href") or ""
                if _CAREERS_HREF.search(href):
                    return href if href.startswith("http") else self.build_full_url(href)
        except Exception:
            pass
        return None

    def get_listing_data(self, item):
        data = {}
        try:
            title_loc = item.locator("h3.uk-card-title").first
            if title_loc.count() > 0:
                data["job_title"] = title_loc.inner_text().strip()
        except Exception:
            pass

        try:
            pub = item.locator("li.date_published time").first
            if pub.count() > 0:
                data["date_posted"] = (
                    pub.get_attribute("datetime") or pub.inner_text() or ""
                ).strip() or None
        except Exception:
            pass

        try:
            closed = item.locator("li.date_closed time").first
            if closed.count() > 0:
                data["close_date"] = (
                    closed.get_attribute("datetime") or closed.inner_text() or ""
                ).strip() or None
        except Exception:
            pass

        try:
            org = item.locator("li.publisher").first
            if org.count() > 0:
                txt = org.inner_text().strip()
                if txt:
                    data["organization"] = txt
        except Exception:
            pass

        try:
            # First meta li is employment type (no special class): Contract / Full Time / …
            skip = ("date_published", "date_closed", "publisher")
            for i in range(item.locator("aside.tw-card-meta li").count()):
                li = item.locator("aside.tw-card-meta li").nth(i)
                classes = (li.get_attribute("class") or "").strip()
                if any(classes == s or classes.startswith(f"{s} ") for s in skip):
                    continue
                txt = li.inner_text().strip()
                if txt:
                    data["employment_type"] = txt
                    break
        except Exception:
            pass

        return data

    # ---- Detail page field extraction ----

    def extract_job_title(self, page, listing_data):
        try:
            loc = page.locator("h1.uk-article-title, h1").first
            if loc.count() > 0:
                txt = loc.inner_text().strip()
                if txt:
                    return txt
        except Exception:
            pass
        return listing_data.get("job_title") or "Unknown"

    def extract_date_posted(self, page, listing_data):
        date = self.extract_meta_date(page)
        if date:
            return date
        try:
            loc = page.locator("#tw_job-publish_date time, li.date_published time").first
            if loc.count() > 0:
                return (loc.get_attribute("datetime") or loc.inner_text() or "").strip() or None
        except Exception:
            pass
        return listing_data.get("date_posted")

    def extract_close_date(self, page, listing_data):
        try:
            loc = page.locator("#tw_job-expiration_date time, li.date_closed time").first
            if loc.count() > 0:
                return (loc.get_attribute("datetime") or loc.inner_text() or "").strip() or None
        except Exception:
            pass
        return listing_data.get("close_date")

    def extract_organization(self, page, listing_data):
        if listing_data.get("organization"):
            return listing_data["organization"]
        try:
            loc = page.locator(
                "#header-content .uk-h2 a, li.publisher a, li.publisher"
            ).first
            if loc.count() > 0:
                txt = loc.inner_text().strip()
                if txt:
                    return txt
        except Exception:
            pass
        return (self.source or {}).get("name") or "Cooperation Canada"

    def extract_employment_type(self, page, listing_data):
        if listing_data.get("employment_type"):
            return listing_data["employment_type"]
        try:
            loc = page.locator("#tw_job-type").first
            if loc.count() > 0:
                txt = loc.inner_text().strip()
                # "Position: Full Time"
                if ":" in txt:
                    txt = txt.split(":", 1)[1].strip()
                if txt:
                    return txt
        except Exception:
            pass
        return None

    def extract_location(self, page, listing_data):
        if listing_data.get("location"):
            return listing_data["location"]
        try:
            text = page.locator(".post-content").first.inner_text()
        except Exception:
            text = ""
        return extract_labeled_value_from_text(text, _LOCATION_LABELS)

    def extract_wage(self, page, listing_data):
        try:
            loc = page.locator("#tw_job-salary").first
            if loc.count() > 0:
                txt = loc.inner_text().strip()
                if ":" in txt:
                    txt = txt.split(":", 1)[1].strip()
                wage = extract_salary_from_text(txt) or txt
                if wage:
                    return wage
        except Exception:
            pass
        try:
            text = page.locator(".post-content").first.inner_text()
            labeled = extract_labeled_value_from_text(text, _SALARY_LABELS)
            return first_nonempty(
                extract_salary_from_text(labeled) if labeled else None,
                labeled,
                extract_salary_from_text(text),
            )
        except Exception:
            pass
        return None

    def extract_description(self, page, listing_data):
        try:
            loc = page.locator(".post-content").first
            if loc.count() > 0:
                text = (loc.inner_text() or "").strip()
                if text:
                    return text
        except Exception:
            pass
        return None
