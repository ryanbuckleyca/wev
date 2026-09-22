"""Chantier de l'économie sociale — offres d'emploi.

Board: https://chantier.qc.ca/decouvrez-leconomie-sociale/offres-demploi/

SPA layout: middle column lists jobs (``a.post-link``); selecting one rewrites
the URL to ``.../offres-demploi/<id>`` and AJAX-loads the detail into
``#ajax_content_blanc``. Each job still has a stable ID URL we can open
directly in a new page (same shell + detail pane).
"""

from __future__ import annotations

import re

from scrapers.base import BaseScraper
from utils.extractors import (
    extract_labeled_value_from_text,
    extract_salary_from_text,
)

_BOARD_URL = "https://chantier.qc.ca/decouvrez-leconomie-sociale/offres-demploi/"
_BOARD_ID_RE = re.compile(
    r"^(https?://chantier\.qc\.ca/decouvrez-leconomie-sociale/offres-demploi)/(\d+)/?$",
    re.IGNORECASE,
)
_ORG_RE = re.compile(
    r"Offre\s+pr[ée]sent[ée]e\s+par\s*:\s*(.+?)(?:\n|$)",
    re.IGNORECASE,
)
_CLOSE_RE = re.compile(
    r"Date\s+de\s+fin\s+de\s+l['’]offre\s*:\s*(.+?)(?:\n|$)",
    re.IGNORECASE,
)
_LOCATION_LABELS = ["Lieu :", "Lieu:"]


class ChantierScraper(BaseScraper):
    is_chronological = True
    language = "fr"
    listing_selector = "a.post-link"
    job_wait_selector = ".titre_ajax_single h1, #ajax_content_blanc .contenu_ajax_single"

    def get_listings_url(self):
        """Always open the board root — the site redirects to the newest job ID."""
        url = ((self.source or {}).get("url") or _BOARD_URL).strip()
        # Drop a trailing /<id> if someone bookmarked a deep link.
        m = _BOARD_ID_RE.match(url.rstrip("/"))
        if m:
            return m.group(1) + "/"
        if "offres-demploi" in url:
            return url if url.endswith("/") else url + "/"
        return _BOARD_URL

    def get_job_url(self, item):
        """Prefer the SPA board URL in ``title`` (…/offres-demploi/<id>).

        The ``href`` points at a separate ``/offres-demploi/<slug>/`` permalink
        that is not how the board UI navigates.
        """
        try:
            title_url = (item.get_attribute("title") or "").strip()
            if _BOARD_ID_RE.match(title_url.rstrip("/")):
                return title_url
            rel = (item.get_attribute("rel") or "").strip()
            if rel.isdigit():
                return f"{_BOARD_URL.rstrip('/')}/{rel}/"
        except Exception:
            pass
        return None

    def get_listing_data(self, item):
        data = {}
        try:
            title_loc = item.locator("h3").first
            if title_loc.count() > 0:
                data["job_title"] = title_loc.inner_text().strip()
        except Exception:
            pass
        return data

    # ---- Detail pane (loaded into #ajax_content_blanc) ----

    def extract_job_title(self, page, listing_data):
        try:
            loc = page.locator(".titre_ajax_single h1").first
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
            loc = page.locator(".date_ajax_single").first
            if loc.count() > 0:
                txt = loc.inner_text().strip()
                if txt:
                    return txt
        except Exception:
            pass
        return listing_data.get("date_posted")

    def extract_close_date(self, page, listing_data):
        text = self._detail_text(page)
        raw = None
        if text:
            m = _CLOSE_RE.search(text)
            if m:
                raw = m.group(1).strip() or None
        raw = raw or listing_data.get("close_date")
        if not raw:
            return None
        # normalize_date() is English-only; convert French close dates here.
        try:
            from utils.date_utils import _parse_localized_date

            return _parse_localized_date(raw, lang="fr").date().isoformat()
        except Exception:
            return raw

    def extract_organization(self, page, listing_data):
        if listing_data.get("organization"):
            return listing_data["organization"]
        text = self._detail_text(page)
        if text:
            m = _ORG_RE.search(text)
            if m:
                return m.group(1).strip() or None
        return (self.source or {}).get("name") or "Chantier de l'économie sociale"

    def extract_location(self, page, listing_data):
        if listing_data.get("location"):
            return listing_data["location"]
        text = self._detail_text(page)
        return extract_labeled_value_from_text(text or "", _LOCATION_LABELS)

    def extract_wage(self, page, listing_data):
        text = self._detail_text(page)
        if not text:
            return None
        return extract_salary_from_text(text)

    def extract_description(self, page, listing_data):
        try:
            loc = page.locator("#ajax_content_blanc .contenu_ajax_single, .contenu_ajax_single").first
            if loc.count() > 0:
                text = (loc.inner_text() or "").strip()
                if text:
                    return text
        except Exception:
            pass
        return None

    def extract_employment_type(self, page, listing_data):
        # Let BaseScraper auto-detect from title/description when unset.
        return listing_data.get("employment_type")

    @staticmethod
    def _detail_text(page) -> str:
        try:
            loc = page.locator("#ajax_content_blanc, #single-post").first
            if loc.count() > 0:
                return (loc.inner_text() or "").strip()
        except Exception:
            pass
        try:
            loc = page.locator(".contenu_ajax_single").first
            if loc.count() > 0:
                return (loc.inner_text() or "").strip()
        except Exception:
            pass
        return ""
