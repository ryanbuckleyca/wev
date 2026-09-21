"""Idealist.org scraper — Canadian jobs and internships.

Jobs (`/en/jobs`) and internships (`/en/internships`) share listing cards,
pagination, and detail-page `data-qa-id` hooks. One class handles both source
URLs (same pattern as WinpScraper / MaCommunauteScraper).

Canada scope is applied in open_listings_page via Idealist's location
autocomplete (country-level search). Listings without a Canadian location
signal are skipped as a defensive filter.
"""

from __future__ import annotations

import re

from scrapers.base import BaseScraper
from utils.extractors import extract_salary_from_text, first_nonempty
from utils.log import scraper_log

_JOBS_URL = "https://www.idealist.org/en/jobs"
_INTERNSHIPS_URL = "https://www.idealist.org/en/internships"

_NEXT_PAGE_PATTERN = re.compile(r"next page", re.IGNORECASE)
_POSTED_RE = re.compile(r"(?:Posted|Published)\s+(.+?)\s*$", re.IGNORECASE)
_EMPTY_COUNT_RE = re.compile(r"^0\s+(?:jobs|internships)$", re.IGNORECASE)
_JOB_TYPE_RE = re.compile(
    r"Job Type:\s*(.+?)(?=\s*(?:Education|Experience Level|Salary|Cause Areas)\b|$)",
    re.IGNORECASE | re.DOTALL,
)

_EMPLOYMENT_TYPE_KEYWORDS = [
    "full-time", "full time", "part-time", "part time",
    "contract", "freelance", "temporary", "internship", "volunteer",
]

# Explicit Canada signal — bare "Anywhere" is not enough.
_CANADA_HINT = re.compile(
    r"\b(?:Canada|Canadian)\b|"
    r",\s*(?:ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU)\b|"
    r"\b(?:Ontario|Quebec|Qu[eé]bec|British Columbia|Alberta|Manitoba|"
    r"Saskatchewan|Nova Scotia|New Brunswick|Newfoundland|"
    r"Prince Edward Island|Yukon|Northwest Territories|Nunavut)\b",
    re.IGNORECASE,
)

_LOCATION_TYPE = frozenset({"remote", "hybrid", "on-site", "onsite", "on site"})


class IdealistScraper(BaseScraper):
    is_chronological = True
    listing_selector = 'main [id^="search-hit-"][data-qa-id="search-result"]'
    job_wait_selector = '[data-qa-id="listing-name"], h1'

    def _build_context_headers(self, use_real_chrome: bool) -> tuple[dict[str, str], str | None]:
        # Google Places autocomplete (used for the Canada filter) rejects the
        # shared Cloudflare-oriented UA / Client-Hints. Use a stock Chromium
        # identity for this board only.
        return {"Accept-Language": "en-CA,en-US;q=0.9,en;q=0.8"}, None

    def start_browser(self, headless=True, viewport=None, use_proxy=False, use_real_chrome=True, use_stealth=True):
        return super().start_browser(
            headless=headless,
            viewport=viewport,
            use_proxy=use_proxy,
            use_real_chrome=False,
            use_stealth=False,
        )

    def _is_internship_board(self) -> bool:
        url = (self.source or {}).get("url") or ""
        return "/internship" in url

    def get_listings_url(self):
        if self._is_internship_board():
            return _INTERNSHIPS_URL
        return _JOBS_URL

    def open_listings_page(self, page):
        def _load_page():
            self._goto_with_networkidle(page, self.get_listings_url())
            self._is_error_page(page)
            self._apply_canada_location(page)
            # Only early-exit on old dates when results are confirmed Newest-first.
            self.is_chronological = self._sort_newest(page)
            if not self.is_chronological:
                scraper_log(
                    "\tIdealist: Newest sort unavailable — chronological early exit disabled"
                )
            page.wait_for_timeout(1500)

        self._retry(_load_page)

    def _apply_canada_location(self, page):
        """Lock search to Canada via Idealist's location autocomplete.

        Desktop and mobile each have a ``[data-qa-id=location-input]``; only the
        desktop field is interactable at a normal viewport. Autocomplete only
        opens when text is typed (``press_sequentially``), not via ``fill``.
        """
        loc = page.locator("#page-header-desktop-search-location")
        if loc.count() == 0:
            loc = page.locator('[data-qa-id="location-input"]').last
        if loc.count() == 0:
            raise RuntimeError("Idealist desktop location input not found")

        current = (loc.input_value() or "").strip()
        if current.lower() != "canada":
            # Clear any geolocated city (e.g. Montreal) via the visible clear btn.
            for i in range(page.locator('[data-qa-id="location-input-clear"]').count()):
                btn = page.locator('[data-qa-id="location-input-clear"]').nth(i)
                try:
                    if btn.is_visible():
                        btn.click(timeout=2000)
                        page.wait_for_timeout(400)
                        break
                except Exception:
                    continue

            loc.click(timeout=5000)
            loc.fill("")
            loc.press_sequentially("Canada", delay=80)
            # Autocomplete mounts a "Loading content..." option first; wait for
            # the real country suggestion before selecting.
            page.wait_for_function(
                """() => {
                    const opts = [...document.querySelectorAll('[role="option"]')];
                    return opts.some(o => (o.innerText || '').trim().split('\\n')[0].trim().toLowerCase() === 'canada');
                }""",
                timeout=15_000,
            )
            page.wait_for_timeout(200)

            option = None
            opts = page.locator('[role="option"]')
            for i in range(opts.count()):
                text = (opts.nth(i).inner_text() or "").strip().splitlines()[0].strip()
                if text.lower() == "canada":
                    option = opts.nth(i)
                    break
            if option is None:
                raise RuntimeError("Idealist Canada location suggestion not found")
            option.click(timeout=5000)
            page.wait_for_timeout(400)

        # Prefer Enter — the first search-button match is often the hidden mobile one.
        loc.press("Enter")
        page.wait_for_timeout(2000)
        scraper_log("\tIdealist: Canada location filter applied")

    def _sort_newest(self, page) -> bool:
        """Click Newest when present. Returns True only on a successful click."""
        try:
            newest = page.get_by_role("button", name=re.compile(r"Newest", re.I))
            if newest.count() == 0:
                newest = page.get_by_role("radio", name=re.compile(r"Newest", re.I))
            if newest.count() == 0:
                return False
            newest.first.click(timeout=3000)
            page.wait_for_timeout(1000)
            scraper_log("\tIdealist: sorted by Newest")
            return True
        except Exception as e:
            scraper_log(f"\tIdealist: could not sort by Newest ({e})")
            return False

    def _has_empty_results(self, page) -> bool:
        """True when Idealist shows a verified empty-results state for the filter."""
        try:
            if page.locator("h2").filter(has_text=_EMPTY_COUNT_RE).count() > 0:
                return True
            body = page.locator("main").inner_text()
            return bool(re.search(r"No (?:jobs|internships) match your search", body or "", re.I))
        except Exception:
            return False

    def get_listing_items(self, page):
        """Return cards, or an empty locator only when Idealist confirms zero hits."""
        self._is_error_page(page)
        if self._has_empty_results(page):
            scraper_log("\tIdealist: no listing cards (empty Canada results)")
            return page.locator(self.listing_selector)
        try:
            page.wait_for_selector(self.listing_selector, state="attached", timeout=10_000)
        except Exception:
            # Results can flip to empty during the wait (filter settle).
            if self._has_empty_results(page):
                scraper_log("\tIdealist: no listing cards (empty Canada results)")
                return page.locator(self.listing_selector)
            raise
        items = page.locator(self.listing_selector)
        scraper_log(f"\tFound {items.count()} listing items")
        return items

    def has_next_page(self, page) -> bool:
        try:
            if page.locator(self.listing_selector).count() == 0:
                return False
            nxt = page.get_by_role("link", name=_NEXT_PAGE_PATTERN)
            return nxt.count() > 0 and nxt.first.is_visible()
        except Exception as e:
            scraper_log(f"\tIdealist: error checking for next page: {e}")
            return False

    def go_next_page(self, page):
        self.current_page_number += 1
        nxt = page.get_by_role("link", name=_NEXT_PAGE_PATTERN)
        with page.expect_navigation():
            nxt.first.click()
        page.wait_for_timeout(2000)

    def get_job_url(self, item):
        listing = self.get_listing_data(item)
        location = listing.get("location") or ""
        if not _CANADA_HINT.search(location):
            title = listing.get("job_title") or "?"
            scraper_log(f"\t\tSkipping non-Canadian listing '{title}' @ {location or '(none)'}")
            return None
        try:
            link = item.locator(
                'a[href*="-job/"], a[href*="-internship/"]'
            )
            if link.count() == 0:
                return super().get_job_url(item)
            href = link.first.get_attribute("href")
            if not href:
                return None
            return href if href.startswith("http") else self.build_full_url(href)
        except Exception:
            return None

    def get_listing_data(self, item) -> dict:
        data: dict = {}
        try:
            title = item.locator('[data-qa-id="search-result-link"]')
            if title.count() > 0:
                data["job_title"] = title.first.inner_text().strip()

            org = item.locator("h4")
            if org.count() > 0:
                data["organization"] = org.first.inner_text().strip()

            text = item.inner_text() or ""
            lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

            location = _location_from_lines(lines)
            if location:
                data["location"] = location

            emp = _employment_from_lines(lines)
            if emp:
                data["employment_type"] = emp

            wage = _wage_from_lines(lines)
            if wage:
                data["wage"] = wage

            # Don't seed relative "Posted 3 days ago" into date_posted — the
            # base recency check can't parse it and chronological scrapers
            # would early-exit. Prefer data-published-date on the detail page.
        except Exception:
            pass
        return data

    def extract_job_title(self, page, listing_data) -> str:
        return first_nonempty(
            self._extract_text(page, '[data-qa-id="listing-name"]'),
            self._extract_text(page, "h1"),
            listing_data.get("job_title"),
            "Unknown",
        )

    def extract_organization(self, page, listing_data) -> str | None:
        return first_nonempty(
            self._extract_text(page, '[data-qa-id="org-link"]'),
            listing_data.get("organization"),
        )

    def extract_location(self, page, listing_data) -> str | None:
        sentence = self._extract_text(page, '[data-qa-id="location-sentence"]')
        if sentence:
            cleaned = sentence.lstrip(", ").strip()
            if cleaned:
                return cleaned
        return listing_data.get("location")

    def extract_wage(self, page, listing_data) -> str | None:
        raw = self._extract_text(page, '[data-qa-id="listing-compensation"]')
        if raw:
            # "Salary:\nCAD 80,000 - 95,000 / year"
            for line in (ln.strip() for ln in raw.splitlines() if ln.strip()):
                if re.search(r"\d", line) and not re.match(r"^salary:?$", line, re.I):
                    return extract_salary_from_text(line) or line
        return listing_data.get("wage")

    def extract_date_posted(self, page, listing_data) -> str | None:
        pub = page.locator('[data-qa-id="listing-header-published-since"]')
        if pub.count() > 0:
            iso = pub.first.get_attribute("data-published-date")
            if iso:
                return iso
            text = pub.first.inner_text().strip()
            m = _POSTED_RE.search(text)
            return m.group(1).strip() if m else text
        return listing_data.get("date_posted")

    def extract_employment_type(self, page, listing_data) -> str | None:
        if self._is_internship_board():
            return "internship"
        if listing_data.get("employment_type"):
            return listing_data["employment_type"]
        try:
            body = page.locator("main").inner_text()
            m = _JOB_TYPE_RE.search(body or "")
            if m:
                return m.group(1).strip()
        except Exception:
            pass
        return None

    def extract_description(self, page, listing_data) -> str | None:
        try:
            toggle = page.locator('[data-qa-id="show-listing-description-toggle"]')
            if toggle.count() > 0:
                try:
                    toggle.first.click(timeout=2000)
                    page.wait_for_timeout(400)
                except Exception:
                    pass
            heading = page.locator("h2").filter(has_text=re.compile(r"^Description$", re.I))
            if heading.count() == 0:
                return None
            text = heading.first.evaluate(
                """el => {
                    let n = el.nextElementSibling;
                    while (n && (!n.innerText || !n.innerText.trim())) {
                        n = n.nextElementSibling;
                    }
                    return n ? n.innerText : null;
                }"""
            )
            if text and str(text).strip():
                return str(text).strip()
        except Exception:
            pass
        return None

    def _extract_text(self, page, selector: str) -> str | None:
        try:
            loc = page.locator(selector)
            if loc.count() == 0:
                return None
            return loc.first.inner_text().strip() or None
        except Exception:
            return None


def _location_from_lines(lines: list[str]) -> str | None:
    for i, line in enumerate(lines):
        lower = line.lower()
        if lower in _LOCATION_TYPE and i + 1 < len(lines):
            nxt = lines[i + 1]
            if _POSTED_RE.match(nxt):
                continue
            if re.search(r"\$|CAD|USD|/\s*(?:year|hour)", nxt, re.I):
                continue
            if nxt.lower() in _LOCATION_TYPE:
                continue
            return f"{line}, {nxt}"
        if _CANADA_HINT.search(line) or lower in {"anywhere", "canada"}:
            return line
    return None


def _employment_from_lines(lines: list[str]) -> str | None:
    for line in lines:
        lower = line.lower()
        if any(kw in lower for kw in _EMPLOYMENT_TYPE_KEYWORDS):
            return line
    return None


def _wage_from_lines(lines: list[str]) -> str | None:
    for line in lines:
        if re.search(r"(?:CAD|USD|\$).*(?:year|hour|month)|/\s*(?:year|hour|month)", line, re.I):
            return extract_salary_from_text(line) or line
    return None
