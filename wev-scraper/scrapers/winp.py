"""WorkInNonProfits.ca scraper.

Paid (`/jobs/`) and volunteer (`/volunteer-jobs/`) boards share listing cards,
pagination, JSON-LD JobPosting, and `.vj_*` detail fields. One class handles
both source URLs (same pattern as MaCommunauteScraper). Listings require a
search form POST (GET /list redirects to /search). We sort by posted date so
ongoing scrapes can stop at the two-week cutoff; a first scrape of the board
collects the full listing.
"""

from __future__ import annotations

import html
import json
import os
import re
from datetime import datetime, timedelta, timezone

from scrapers.base import BaseScraper
from utils.extractors import extract_salary_from_text, first_nonempty
from utils.log import scraper_log

_VIEW_LANG = re.compile(r"/view/\d+/([EF])(?:/|$)", re.I)
_GENERIC_LOCATIONS = frozenset({"international", "from anywhere", "anywhere", "n/a", "na"})
_SCHEMA_EMPLOYMENT = {
    "FULL_TIME": "full-time",
    "PART_TIME": "part-time",
    "CONTRACTOR": "contract",
    "TEMPORARY": "temporary",
    "INTERN": "internship",
    "VOLUNTEER": "volunteer",
    "PER_DIEM": "casual",
}


_HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)
_OFFICE_TAG = re.compile(r"</?(?:v|o|w|m|st\d*):[^>]*>", re.I)
_HTML_TAG = re.compile(r"<[^>]+>")
_BREAK_TAG = re.compile(r"<br\s*/?>", re.I)
_BLOCK_END = re.compile(r"</(?:p|div|h[1-6]|li|tr|blockquote|table)>", re.I)


def _clean_text(value: str | None) -> str | None:
    if not value:
        return None
    text = re.sub(r"[ \t]+", " ", html.unescape(value))
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return ", ".join(lines) or None


def _html_to_visible_text(value: str | None) -> str | None:
    """Drop Word/VML/office markup and tags; keep readable job-posting text."""
    if not value:
        return None
    text = html.unescape(value).replace("\xa0", " ")
    text = _HTML_COMMENT.sub(" ", text)
    text = _OFFICE_TAG.sub(" ", text)
    text = _BREAK_TAG.sub("\n", text)
    text = _BLOCK_END.sub("\n", text)
    text = _HTML_TAG.sub(" ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" +([,.;:!?])", r"\1", text)
    compact: list[str] = []
    for line in (ln.strip() for ln in text.splitlines()):
        if line:
            compact.append(line)
        elif compact and compact[-1] != "":
            compact.append("")
    return "\n".join(compact).strip() or None


def _visible_description(*chunks: str | None) -> str | None:
    parts = [p for p in (_html_to_visible_text(chunk) for chunk in chunks) if p]
    return "\n\n".join(parts) or None


class WinpScraper(BaseScraper):
    is_chronological = True
    listing_selector = "div.job_item.card"
    job_wait_selector = ".vj_title"

    def _is_volunteer_board(self) -> bool:
        url = (self.source or {}).get("url") or ""
        return "/volunteer-jobs/" in url

    def fetch_jobs(self, headless=True):
        if not self._should_collect_full_board():
            return super().fetch_jobs(headless=headless)
        scraper_log("\tWINP: archive walk — collecting listings beyond the two-week cutoff")
        previous = os.environ.get("WITHIN_WEEKS")
        os.environ["WITHIN_WEEKS"] = "9999"
        self._winp_pagination_failed = False
        try:
            jobs = super().fetch_jobs(headless=headless)
            if self.should_quit_list or self._winp_pagination_failed:
                scraper_log(
                    "\t⚠️ WINP: archive walk stopped early (job cap or pagination error). "
                    "The next uncapped run will keep collecting older listings."
                )
            return jobs
        finally:
            if previous is None:
                os.environ.pop("WITHIN_WEEKS", None)
            else:
                os.environ["WITHIN_WEEKS"] = previous

    def go_next_page(self, page):
        next_num = self.current_page_number + 1
        next_link = page.locator("li.page-item:not(.disabled) a.next_job_page").first
        scraper_log(f"\tWINP: page {next_num}")
        try:
            with page.expect_navigation():
                next_link.click()
            page.wait_for_selector(self.listing_selector, state="attached", timeout=15_000)
            self.current_page_number = next_num
        except Exception:
            self._winp_pagination_failed = True
            raise

    def _board_has_existing_urls(self) -> bool:
        volunteer = self._is_volunteer_board()
        for url in self.existing_urls:
            if "workinnonprofits.ca" not in (url or ""):
                continue
            if volunteer and "/volunteer-jobs/" in url:
                return True
            if not volunteer and "/jobs/" in url and "/volunteer-jobs/" not in url:
                return True
        return False

    def _oldest_existing_date_posted(self) -> str | None:
        if hasattr(self, "_oldest_posted_override"):
            return self._oldest_posted_override
        source_id = (self.source or {}).get("id")
        if not source_id:
            return None
        try:
            from utils.db import supabase

            resp = (
                supabase.table("jobs")
                .select("date_posted")
                .eq("source_id", source_id)
                .not_.is_("date_posted", "null")
                .order("date_posted")
                .limit(1)
                .execute()
            )
            rows = resp.data or []
            return rows[0].get("date_posted") if rows else None
        except Exception as exc:
            scraper_log(f"\tWINP: could not read oldest date_posted ({exc}); keeping archive walk")
            return None

    def _should_collect_full_board(self) -> bool:
        """Keep walking the archive until a stored job is older than WITHIN_WEEKS.

        Presence of any URL is not enough: a capped or failed first scrape would
        otherwise permanently disable the backfill.
        """
        if not self._board_has_existing_urls():
            return True
        oldest = self._oldest_existing_date_posted()
        if not oldest:
            return True
        try:
            from dateutil import parser as date_parser

            posted = date_parser.parse(str(oldest))
            if posted.tzinfo is None:
                posted = posted.replace(tzinfo=timezone.utc)
            else:
                posted = posted.astimezone(timezone.utc)
        except (ValueError, TypeError, OverflowError):
            return True
        from utils.date_utils import get_within_weeks

        cutoff = datetime.now(timezone.utc) - timedelta(weeks=get_within_weeks())
        return posted >= cutoff

    def open_listings_page(self, page):
        def _load_page():
            self._goto_with_networkidle(page, self.get_listings_url())
            self._is_error_page(page)
            self._require_posted_date_sort(page)
            page.locator("form button.btn-primary[type=submit]").first.click()
            page.wait_for_selector(self.listing_selector, state="attached", timeout=15_000)
            self._is_error_page(page)

        self._retry(_load_page)

    def _require_posted_date_sort(self, page) -> None:
        sort = page.locator("#sort_jobs_byPD")
        if sort.count() == 0:
            raise RuntimeError("WINP posted-date sort control #sort_jobs_byPD not found")
        sort.first.click(force=True)

    def has_next_page(self, page) -> bool:
        try:
            return page.locator("li.page-item:not(.disabled) a.next_job_page").count() > 0
        except Exception:
            return False

    def get_job_url(self, item):
        loc = item.locator("span.lj_title a[href*='/E/']")
        if loc.count() == 0:
            loc = item.locator("span.lj_title a")
        if loc.count() == 0:
            return super().get_job_url(item)
        href = loc.first.get_attribute("href")
        if not href:
            return None
        return href if href.startswith("http") else self.build_full_url(href)

    def get_listing_data(self, item) -> dict:
        data: dict = {}
        title = self._locator_text(item, "span.lj_title a")
        if title:
            data["job_title"] = title
        card_location = _clean_text(self._locator_text(item, "span.lj_loc"))
        if card_location:
            data["card_location"] = card_location
        return data

    def create_job_dict(self, **kwargs):
        job = super().create_job_dict(**kwargs)
        url = kwargs.get("listing_url") or job.get("listing_url") or ""
        match = _VIEW_LANG.search(url)
        if match:
            # normalize_job_data drops language; save_job reads it from this dict.
            job["language"] = "fr" if match.group(1).upper() == "F" else "en"
        return job

    def extract_job_title(self, page, listing_data):
        posting = self._jobposting(page)
        return first_nonempty(
            _clean_text(posting.get("title")),
            self._extract_text(page, ".vj_title"),
            listing_data.get("job_title"),
            "Unknown",
        )

    def extract_organization(self, page, listing_data):
        posting = self._jobposting(page)
        org = posting.get("hiringOrganization")
        name = org.get("name") if isinstance(org, dict) else None
        return _clean_text(name) or self._extract_text(page, ".vj_orgname")

    def extract_date_posted(self, page, listing_data):
        posted = first_nonempty(
            _iso_date(self._jobposting(page).get("datePosted")),
            _iso_date(self.extract_meta_date(page)),
            _iso_date(listing_data.get("date_posted")),
        )
        if posted:
            return posted
        url = listing_data.get("listing_url") or getattr(page, "url", "") or ""
        scraper_log(
            f"\t\tWarning: no date_posted for {url or 'listing'} — using scrape date so the bulletin can show it"
        )
        return datetime.now(timezone.utc).date().isoformat()

    def extract_close_date(self, page, listing_data):
        return _iso_date(self._jobposting(page).get("validThrough"))

    def extract_employment_type(self, page, listing_data):
        if self._is_volunteer_board():
            return "volunteer"
        mapped = _schema_employment(self._jobposting(page).get("employmentType"))
        if mapped:
            return mapped
        return self._extract_text(page, ".vj_type")

    def extract_location(self, page, listing_data):
        loc = self._extract_text(page, ".vj_loc")
        card = listing_data.get("card_location")
        if _is_generic_location(loc) and card and card.lower() != (loc or "").lower():
            return f"{loc}, {card}" if loc else card
        return loc

    def extract_description(self, page, listing_data):
        text = _visible_description(
            self._extract_html(page, ".vj_desc"),
            self._extract_html(page, ".vj_appinst"),
        )
        if text:
            return text
        schema = self._jobposting(page).get("description")
        return _visible_description(schema) if isinstance(schema, str) else None

    def extract_wage(self, page, listing_data):
        raw = self._extract_text(page, ".vj_sal")
        if not raw:
            return None
        return extract_salary_from_text(raw) or raw

    def _jobposting(self, page) -> dict:
        cache = getattr(self, "_ld_cache", None)
        key = getattr(page, "url", None) or id(page)
        if cache and cache[0] == key:
            return cache[1]
        posting = {}
        loc = page.locator('script[type="application/ld+json"]')
        try:
            count = loc.count()
        except Exception:
            self._ld_cache = (key, posting)
            return posting
        for i in range(count):
            try:
                raw = (loc.nth(i).evaluate("el => el.textContent") or "").strip()
                data = json.loads(raw)
            except Exception:
                continue
            found = _as_jobposting(data)
            if found:
                posting = found
                break
        self._ld_cache = (key, posting)
        return posting

    def _extract_text(self, page, selector: str) -> str | None:
        return _clean_text(self._locator_text(page, selector))

    def _extract_html(self, page, selector: str) -> str | None:
        try:
            loc = page.locator(selector)
            if loc.count() == 0:
                return None
            value = loc.first.inner_html()
            return value.strip() if isinstance(value, str) and value.strip() else None
        except Exception:
            return None

    @staticmethod
    def _locator_text(root, selector: str) -> str | None:
        try:
            loc = root.locator(selector)
            if loc.count() == 0:
                return None
            text = loc.first.inner_text().strip()
            return text or None
        except Exception as e:
            scraper_log(f"\t\tWarning: {selector}: {e}")
            return None


def _schema_employment(value) -> str | None:
    if not value or not isinstance(value, str):
        return None
    key = value.strip().upper().replace(" ", "_")
    return _SCHEMA_EMPLOYMENT.get(key) or value.replace("_", "-").lower()


def _as_jobposting(data) -> dict | None:
    if isinstance(data, list):
        for item in data:
            found = _as_jobposting(item)
            if found:
                return found
        return None
    if isinstance(data, dict) and data.get("@type") == "JobPosting":
        return data
    return None


def _iso_date(value) -> str | None:
    if not value or not isinstance(value, str):
        return None
    return value.strip()[:10] or None


def _is_generic_location(loc: str | None) -> bool:
    return not loc or loc.strip().lower() in _GENERIC_LOCATIONS
