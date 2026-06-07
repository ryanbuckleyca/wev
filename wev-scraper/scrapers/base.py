import os
import time
from typing import TYPE_CHECKING
from urllib.parse import urlparse

from utils.constants import BROWSER_USER_AGENT
from utils.date_utils import _parse_localized_date, is_recent_job
from utils.env import is_truthy_env
from utils.log import scraper_log
from utils.normalize import normalize_job_data
from utils.url import normalize_listing_url

if TYPE_CHECKING:
    from playwright.sync_api import ProxySettings


def _is_ci() -> bool:
    return os.environ.get("GITHUB_ACTIONS") == "true"


_stealth_instance = None

def _get_stealth():
    """Lazy singleton — avoids reading JS files from disk on every browser launch."""
    global _stealth_instance
    if _stealth_instance is None:
        from playwright_stealth import Stealth
        _stealth_instance = Stealth()
    return _stealth_instance


_HEAVY_RESOURCE_TYPES = {"image", "stylesheet", "font", "media"}

def _block_heavy_resources(context) -> None:
    """Block bandwidth-heavy resource types. Used when routing through a proxy."""
    context.route(
        "**/*",
        lambda route: (
            route.abort()
            if route.request.resource_type in _HEAVY_RESOURCE_TYPES
            else route.continue_()
        ),
    )


class BaseScraper:
    """Base scraper with built-in field extraction orchestration.

    HOW TO ADD A NEW SCRAPER
    ========================

    1. Create scrapers/<site>.py with a class that extends BaseScraper.

    2. Set class attributes:
       - listing_selector = "..."       (CSS selector for job cards on the listing page)
       - job_wait_selector = "..."      (CSS selector to wait for on each job page)
       - SELECTORS = { ... }           (CSS selectors for job fields, see below)
       - is_chronological = True/False  (stop early when an old job is found?)
       - date_language = "fr"           (only if dates are non-English)
       - filter_values = [...]          (if the site needs province/region filtering)

    3. That's usually enough. The base handles:
       - Finding listing items via listing_selector
       - Extracting the job URL from the first <a> tag in each listing
       - Waiting for job_wait_selector on the detail page

       Override only if the site needs special behavior:
       - get_listing_items(page)       -> custom listing discovery (fallback selectors, etc.)
       - get_job_url(item)             -> custom URL extraction (dedup, URL filtering, etc.)
       - get_job_wait_selector()       -> dynamic wait selector

    4. Define how each field is extracted. You have two options per field:

       a) CSS selector — add to the SELECTORS dict:
          SELECTORS = {"job_title": "h1.entry-title", "wage": ".salary"}

          Values can be a plain string (extracts inner text) or a tuple:
          ("selector", "html")                       -> inner HTML
          ("selector", ("attr", "href"))             -> element attribute
          ("selector", "text", "Posted on")          -> text with prefix stripped

       b) Custom method — define extract_<field>(self, page, listing_data):
          def extract_wage(self, page, listing_data):
              ...
              return "$50,000"

       Fields: job_title, date_posted, description, organization,
               location, wage, employment_type, close_date

       Custom methods take priority over SELECTORS. If neither is defined
       for a field, it stays None. Employment type auto-detects from
       title/description/wage text as a fallback.

    5. Optional hooks:
       - get_listing_data(item)        -> extract fields from the listing page
                                          (returned dict takes priority over job page)
       - open_listings_page(page, filter_value)
       - setup_pagination(page)
       - has_next_page(page) / go_next_page(page)
       - start_browser(headless, viewport)
       - fetch_jobs(headless)          -> override for post-processing (e.g. LLM)

    6. Register in scrape.py:
       - Import the class
       - Add to SCRAPER_MAP: {"<source_uuid>": YourScraper}

    MINIMAL EXAMPLE (WordPress job board — zero methods needed):

        class MyScraper(BaseScraper):
            is_chronological = True
            listing_selector = "li.job_listing"
            job_wait_selector = "article"
            SELECTORS = {
                "job_title": "h1.entry-title",
                "date_posted": (".date-posted time", "text", "Posted on"),
                "description": (".job_description", "html"),
                "location": ".location",
                "wage": ".salary",
                "organization": ".company .name strong",
                "employment_type": ".job-type",
            }
    """

    # ---- Class-level configuration (override in subclasses) ----
    SELECTORS = {}
    listing_selector = None
    job_wait_selector = None
    is_chronological = False
    # Preferred: override `language` (e.g. "fr"); `date_language` is kept for
    # backwards-compatibility and, if set, takes precedence over `language`.
    language = "en"
    date_language = None

    def __init__(self, source):
        self.source = source
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
        # Optional pagination variables (not all sites need these)
        self.listings_page = None
        self.page_count = 1
        self.current_page_number = 1
        # Will be set globally from scrape.py for all scrapers
        self.existing_urls = set()
        # Track skipped duplicates for reporting
        self.skipped_duplicates = 0
        # Track total listings found (including duplicates)
        self.total_listings_found = 0
        self.next_button = None
        self.jobs = []
        self.scraped_urls = set()
        # Flag to track if we should stop scraping early (for chronological scrapers)
        self.should_quit_list = False
        # Standardized job page wait/timeout configuration
        self.job_page_timeout_ms = 10_000
        # Resolve job limits once at construction time so they're stable across pages
        self._max_jobs = self._parse_int_env("MAX_JOBS_PER_SOURCE")
        self._max_jobs_per_page = self._parse_int_env("MAX_JOBS_PER_PAGE")

    @staticmethod
    def _parse_int_env(name: str) -> int | None:
        val = os.environ.get(name)
        if not val:
            return None
        try:
            return int(val)
        except ValueError:
            return None

    # ---- Subclass hooks ----
    def get_listings_url(self, filter_value=None):
        return self.source["url"]

    def get_filter_values(self):
        return getattr(self, "filter_values", [None])

    def _retry(self, func, *args, max_retries=3, **kwargs):
        """Retry func up to max_retries times. Bails immediately on 403s when no proxy is available."""
        for attempt in range(1, max_retries + 1):
            try:
                scraper_log(f"\tAttempt {attempt}/{max_retries}...")
                result = func(*args, **kwargs)
                scraper_log("\t✅ Success")
                return result
            except Exception as e:
                error_msg = str(e)
                is_403 = "403 forbidden" in error_msg.lower() or "ip blocked" in error_msg.lower()

                if "timeout" in error_msg.lower():
                    scraper_log(f"\t⚠️  Timeout (attempt {attempt}/{max_retries})")
                else:
                    scraper_log(f"\t⚠️  Error (attempt {attempt}/{max_retries}): {error_msg[:100]}")

                if is_403 and not _is_ci():
                    scraper_log("\t❌ 403 with no proxy — skipping retries")
                    raise

                if attempt < max_retries:
                    scraper_log("\t🔄 Retrying...")
                    time.sleep(2)
                else:
                    scraper_log(f"\t❌ Failed after {max_retries} attempts")
                    raise

    def open_listings_page(self, page, filter_value=None):
        """Navigate to the listings page. Waits for networkidle, checks for error pages (403/404/Cloudflare), retries up to 3 times on failure."""
        def _load_page():
            self._goto_with_networkidle(page, self.get_listings_url(filter_value))
            # Check if page loaded successfully (not a 404 or error page)
            self._is_error_page(page)

        self._retry(_load_page)

    def _goto_with_networkidle(self, page, url: str, timeout: int = 30000, networkidle_timeout: int = 15000):
        """Navigate to url, then wait for networkidle (best-effort — timeout is non-fatal)."""
        page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        try:
            page.wait_for_load_state("networkidle", timeout=networkidle_timeout)
        except Exception:
            pass

    def _is_error_page(self, page):
        """Check if the page is an error page (404, 403, Cloudflare challenge, etc.).
        Raises an exception with a descriptive message if an error page is detected.
        Re-raises if the page content cannot be read (closed/crashed page = retryable failure)."""
        try:
            page_content = page.content()
            page_title = page.title().lower()
        except Exception as e:
            raise Exception(f"Could not read page content (page may be closed or crashed): {e}") from e

        content_lower = page_content.lower()

        # Check for 403 forbidden
        if "403" in page_title or "forbidden" in page_title or "access denied" in page_title:
            raise Exception("403 Forbidden - IP blocked by site")
        if "403 forbidden" in content_lower or "<title>403</title>" in content_lower:
            raise Exception("403 Forbidden - IP blocked by site")

        # Check for 404 errors
        if "404" in page_title or "not found" in page_title or "introuvable" in page_title:
            raise Exception(f"404 Not Found - {page.title()}")

        # Check for Cloudflare challenge
        # We check title explicitly to avoid false positives when CF scripts are present but the page loaded successfully
        if "cloudflare" in page_title or "attention required" in page_title or "just a moment" in page_title:
            raise Exception("Cloudflare challenge page detected")

        challenge_indicators = [
            "checking your browser",
            "please wait while we check",
            "verify you are human",
            'class="cf-challenge"',
        ]
        
        # If the title isn't a dead giveaway, check for strict challenge text in the body
        for indicator in challenge_indicators:
            # We don't just check content_lower, we want to make sure it's an actual challenge page
            # Usually challenge pages have very short text content
            if indicator in content_lower and len(page_content) < 50000:
                raise Exception(f"Bot challenge detected: '{indicator}'")

    def get_listing_items(self, page):
        """Get listing items with automatic retry logic for proxy rotation."""
        if not self.listing_selector:
            raise NotImplementedError("Set listing_selector or override get_listing_items()")

        def _get_items():
            # Check if we're on an error page before trying to find items
            self._is_error_page(page)

            # Try to find the listing items
            page.wait_for_selector(self.listing_selector, state="attached", timeout=10_000)
            items = page.locator(self.listing_selector)

            if items.count() == 0:
                raise Exception(f"Found 0 items with selector: {self.listing_selector}")

            scraper_log(f"\tFound {items.count()} listing items")
            return items

        return self._retry(_get_items)

    def get_job_url(self, item):
        try:
            href = item.get_attribute("href")
            if not href:
                href = item.locator("a").first.get_attribute("href")
        except Exception:
            return None
        if not href:
            return None
        full_url = href if href.startswith("http") else self.build_full_url(href)
        # Reject URLs that point back to the listing board itself
        source_url = (self.source or {}).get("url", "")
        if source_url and full_url.rstrip("/") == source_url.rstrip("/"):
            return None
        return full_url

    def get_listing_data(self, item):
        return {}

    def get_job_wait_selector(self):
        return self.job_wait_selector

    def has_next_page(self, page):
        return False

    def go_next_page(self, page):
        return None

    def setup_pagination(self, page):
        pass

    # ---- Field extraction ----

    def extract_job_fields(self, job_page, listing_data=None, index=0):
        """Extract all job fields and append the job to self.jobs.

        Subclasses should NOT override this. Instead, define:
        - SELECTORS: dict mapping field names to CSS selectors
        - extract_<field>(page, listing_data): methods for custom extraction
        - get_listing_data(item): for fields available on the listing page

        Listing data takes priority over job page extraction.
        """
        listing_data = listing_data or {}

        # Get date and title early for recency check (before expensive work)
        date_str = (
            listing_data.get("date_posted")
            or self._get_field("date_posted", job_page, listing_data)
        )
        title = (
            listing_data.get("job_title")
            or self._get_field("job_title", job_page, listing_data)
            or "Unknown"
        )

        lang = self.date_language or getattr(self, "language", None) or "en"

        if date_str:
            from utils.date_utils import get_within_weeks
            weeks = get_within_weeks()

            if not is_recent_job(date_str, weeks=weeks, lang=lang):
                url = listing_data.get("listing_url", "")
                url_display = f" ({url})" if url else ""
                scraper_log(f"\t\tSkipping out-dated job {index + 1}{url_display}: '{title}'...")
                if self.is_chronological:
                    scraper_log("\t\tStopping early: chronological scraper encountered non-recent job")
                    self.should_quit_list = True
                return
            scraper_log(f"\t\tProcessing job {index + 1}: '{title}' posted {date_str}...")
        else:
            scraper_log(f"\t\tProcessing job {index + 1}: '{title}' (date not available)...")

        # Normalize date to ISO for consistent downstream processing
        if date_str:
            try:
                dt = _parse_localized_date(date_str, lang=lang)
                date_str = dt.isoformat()
            except Exception:
                pass

        # Extract remaining fields; listing_data values take priority
        fields = {"date_posted": date_str, "job_title": title}
        for name in ("description", "organization", "location", "wage",
                     "employment_type", "close_date"):
            fields[name] = (
                listing_data.get(name)
                or self._get_field(name, job_page, listing_data)
            )

        # Auto-detect employment type from available text when not explicitly set
        if not fields.get("employment_type"):
            from utils.extractors import detect_employment_type_from_texts
            fields["employment_type"] = detect_employment_type_from_texts(
                [fields.get("job_title"), fields.get("description"), fields.get("wage")]
            )

        fields["listing_url"] = listing_data.get("listing_url") or job_page.url
        # Summary is generated in the unified post-processor after all jobs are saved,
        # batched together with values/skills/SSE — no inline per-job call needed.

        job_dict = self.create_job_dict(language=getattr(self, "language", "en"), **fields)
        # SSE classification is handled in the unified post-processor after all jobs are saved.
        self.jobs.append(job_dict)

    def _get_field(self, name, page, listing_data):
        """Resolve a single field: custom extract_<name>() method first, then SELECTORS."""
        method = getattr(self, f"extract_{name}", None)
        if method:
            return method(page, listing_data)
        if name in self.SELECTORS:
            return self.extract_with_selectors(page, {name: self.SELECTORS[name]}).get(name)
        return None

    @staticmethod
    def extract_meta_date(page) -> str | None:
        """Read a publication date from common <meta> tag variants.

        Checks in priority order:
          1. article:published_time  (Open Graph — most reliable)
          2. pubdate                 (legacy HTML5 meta)
          3. article:modified_time   (Open Graph fallback — used by some WP themes)
          4. article:published_time as name= (non-standard but seen in the wild)

        Returns the content string, or None if none are present.
        """
        try:
            meta = page.locator(
                'meta[property="article:published_time"], '
                'meta[name="pubdate"], '
                'meta[property="article:modified_time"], '
                'meta[name="article:published_time"]'
            ).first
            return meta.get_attribute("content") or None
        except Exception:
            return None

    # ---- Template-method flow ----
    def fetch_jobs(self, headless=True):
        self.listings_page = self.start_browser(headless=headless)
        try:
            for filter_value in self.get_filter_values() or [None]:
                self.current_page_number = 1
                self.page_count = 1
                self.should_quit_list = False
                self.open_listings_page(self.listings_page, filter_value)
                self.setup_pagination(self.listings_page)
                while True:
                    if self.should_quit_list:
                        break
                    items = self.get_listing_items(self.listings_page)
                    self._process_listing_items(items)
                    if self.should_quit_list:
                        scraper_log(f"\tStopped after page {self.current_page_number} (chronological early exit).")
                        break
                    if not self.has_next_page(self.listings_page):
                        scraper_log(f"\tNo more pages after page {self.current_page_number}.")
                        break
                    try:
                        self.go_next_page(self.listings_page)
                    except Exception as e:
                        scraper_log(f"\tNotice: Pagination failed on page {self.current_page_number}: {e}")
                        try:
                            self.upload_error_screenshot_from_page(self.listings_page)
                        except Exception:
                            pass
                        break
        finally:
            self.close_browser()
        return self.jobs

    def _process_listing_items(self, items):
        max_jobs = self._max_jobs
        max_jobs_per_page = self._max_jobs_per_page

        jobs_this_page = 0
        for i, item in self._iter_items(items):
            if self.should_quit_list:
                break

            # Limit successful extractions (not attempts — skips don't count)
            if max_jobs is not None and len(self.jobs) >= max_jobs:
                scraper_log(f"🛑 Reached max jobs limit ({max_jobs}). Collected {len(self.jobs)} jobs.")
                self.should_quit_list = True
                break

            if max_jobs_per_page is not None and jobs_this_page >= max_jobs_per_page:
                scraper_log(f"🛑 Reached per-page limit ({max_jobs_per_page}). Moving to next page.")
                break

            job_page = None
            try:
                job_url = self.get_job_url(item)
                if not job_url:
                    scraper_log(f"\t\tSkipping job {i + 1}, no URL found")
                    continue

                # Count total listings found
                self.total_listings_found += 1

                # Check for duplicate URL before opening job page. If the
                # environment requests overriding existing entries, do NOT
                # skip here so the scraper will open the job page and allow
                # `save_job()` to update the existing row.
                try:
                    skip_on_existing = not is_truthy_env("SHOULD_OVERRIDE_EXISTING")
                    compare_only = is_truthy_env("COMPARE_ONLY")
                except Exception:
                    skip_on_existing = True
                    compare_only = False

                norm_url = normalize_listing_url(job_url)
                if not norm_url:
                    scraper_log(f"\t\tSkipping job {i + 1} ({job_url!r}), URL normalizes to empty")
                    continue
                if norm_url in self.existing_urls and skip_on_existing:
                    scraper_log(f"\t\tSkipping job {i + 1} ({job_url}), already exists in database")
                    self.skipped_duplicates += 1
                    continue

                if compare_only and norm_url not in self.existing_urls:
                    scraper_log(f"\t\tSkipping job {i + 1} ({job_url}), new URL (compare-only mode)")
                    continue

                if norm_url in self.scraped_urls:
                    scraper_log(f"\t\tSkipping job {i + 1} ({job_url}), already scraped this run")
                    continue
                self.scraped_urls.add(norm_url)

                listing_data = self.get_listing_data(item) or {}
                # Crucially, set listing_url from the listing item as it's the unique ID
                listing_data["listing_url"] = norm_url
                job_page, success = self.safe_open_job_page(
                    job_url,
                    wait_selector=self.get_job_wait_selector(),
                    timeout=self.job_page_timeout_ms,
                )
                if not success:
                    scraper_log(f"\t\tSkipping job {i + 1} ({job_url}), failed to open job page")
                    continue

                self.extract_job_fields(job_page, listing_data, i)
                jobs_this_page += 1
            except Exception as e:
                scraper_log(f"\tNotice: Error processing job {i + 1}: {e}")
            finally:
                if job_page:
                    try:
                        job_page.close()
                    except Exception:
                        pass

    def _iter_items(self, items):
        # Supports Playwright Locator or a list of Locators
        if hasattr(items, "count") and hasattr(items, "nth"):
            count = items.count()
            scraper_log(f"\tProcessing {count} jobs on page {self.current_page_number}...")
            for i in range(count):
                try:
                    yield i, items.nth(i)
                except Exception as e:
                    scraper_log(f"\tNotice: Could not access item {i + 1} (stale locator?): {e}")
                    return
        else:
            items_list = list(items) if items else []
            scraper_log(f"\tProcessing {len(items_list)} jobs on page {self.current_page_number}...")
            for i, item in enumerate(items_list):
                yield i, item

    # ---- Selector extraction helpers ----
    def extract_with_selectors(self, page, selectors: dict):
        """Extract values from a page using a selector config.

        selector values can be:
        - "css.selector"                             -> inner text
        - ("css.selector", "html")                   -> inner HTML
        - ("css.selector", ("attr", "href"))         -> element attribute
        - ("css.selector", "text", "Posted on")      -> text with prefix stripped
        """
        data = {}
        for key, spec in selectors.items():
            selector = None
            method = "text"
            attr = None
            strip_prefix = None
            if isinstance(spec, tuple):
                selector = spec[0]
                method = spec[1] if len(spec) > 1 else "text"
                strip_prefix = spec[2] if len(spec) > 2 else None
                if isinstance(method, tuple) and method[0] == "attr":
                    attr = method[1]
                    method = "attr"
            else:
                selector = spec
            try:
                loc = page.locator(selector).first
                if method == "html":
                    value = loc.inner_html()
                elif method == "attr":
                    value = loc.get_attribute(attr)
                else:
                    value = loc.inner_text()
                if isinstance(value, str):
                    value = value.strip()
                    if strip_prefix and value.startswith(strip_prefix):
                        value = value[len(strip_prefix):].strip()
                data[key] = value
            except Exception:
                data[key] = None
        return data


    def upload_error_screenshot_from_page(self, page, context_name: str | None = None):
        """Capture screenshot from page, upload to Supabase, and print the URL. Call when an error occurs (e.g. pagination timeout)."""
        from utils.db import get_supabase_url, supabase
        from utils.storage import capture_and_upload_error_screenshot
        source_name = context_name or (self.source.get("name") if self.source else None) or "scraper"
        capture_and_upload_error_screenshot(page, supabase, get_supabase_url(), source_name)

    def _resolve_headless(self, headless: bool) -> bool:
        """Return False if the --headed flag was set via SCRAPER_HEADED env var."""
        return False if os.environ.get("SCRAPER_HEADED") == "1" else headless

    def start_browser(self, headless=True, viewport=None, use_proxy=False, use_real_chrome=True, use_stealth=True):
        """Launch browser and return the main page.

        use_real_chrome: use installed Chrome instead of bundled Chromium (default: True).
            Bypasses TLS fingerprint blocks that headless Chromium triggers.
            Falls back to Chromium if Chrome isn't installed.
        use_proxy: route traffic through PROXY_SERVER when explicitly enabled
            with ``use_proxy=True``; it is not automatically enabled in CI.
        use_stealth: apply playwright-stealth to the browser context (default: True).
            Disable for sites where stealth causes rendering issues (e.g. Acuspire widgets).
        """
        from playwright.sync_api import ViewportSize, sync_playwright

        headless = self._resolve_headless(headless)
        v: ViewportSize = viewport or {"width": 1280, "height": 720}
        self.playwright = sync_playwright().start()
        self.browser = self._launch_browser(headless, v, use_real_chrome)
        base_headers, user_agent = self._build_context_headers(use_real_chrome)
        raw_proxy = self._build_proxy_config(use_proxy)
        optional_kwargs = {}
        if user_agent is not None:
            optional_kwargs["user_agent"] = user_agent
        if raw_proxy is not None:
            optional_kwargs["proxy"] = raw_proxy
        self.context = self.browser.new_context(
            viewport=v,
            locale="en-CA",
            timezone_id="America/Toronto",
            permissions=["geolocation"],
            ignore_https_errors=False,
            extra_http_headers=base_headers,
            **optional_kwargs,
        )
        if use_stealth:
            _get_stealth().apply_stealth_sync(self.context)
        if raw_proxy:
            _block_heavy_resources(self.context)
        assert self.context is not None
        self.page = self.context.new_page()
        self.page.set_default_navigation_timeout(60_000)
        return self.page

    def _launch_browser(self, headless, viewport, use_real_chrome):
        assert self.playwright is not None
        args = [
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-infobars",
            f"--window-size={viewport['width']},{viewport['height']}",
        ]
        if use_real_chrome:
            try:
                return self.playwright.chromium.launch(headless=headless, channel="chrome", args=args)
            except Exception as e:
                scraper_log(f"\tChrome launch failed ({e}), falling back to Chromium")
        return self.playwright.chromium.launch(headless=headless, args=args)

    def _build_context_headers(self, use_real_chrome: bool) -> tuple[dict[str, str], str | None]:
        """Build extra HTTP headers and optional user-agent for the browser context."""
        base_headers: dict[str, str] = {
            "Accept-Language": "en-CA,en-US;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            "Upgrade-Insecure-Requests": "1",
        }
        
        # Always override user agent and Client Hints to prevent Cloudflare from detecting HeadlessChrome
        user_agent: str | None = BROWSER_USER_AGENT
        platform = '"Linux"' if _is_ci() else '"macOS"'
        base_headers.update({
            "Sec-CH-UA": '"Google Chrome";v="149", "Chromium";v="149", "Not_A Brand";v="24"',
            "Sec-CH-UA-Mobile": "?0",
            "Sec-CH-UA-Platform": platform,
        })
        return base_headers, user_agent

    def _build_proxy_config(self, use_proxy: bool) -> "ProxySettings | None":
        """Return proxy config if PROXY_SERVER is set and use_proxy=True, else None."""
        from playwright.sync_api import ProxySettings
        proxy_server = os.environ.get("PROXY_SERVER")
        if not proxy_server or not use_proxy:
            return None
        config: ProxySettings = {"server": proxy_server}
        if user := os.environ.get("PROXY_USERNAME"):
            config["username"] = user
        if pwd := os.environ.get("PROXY_PASSWORD"):
            config["password"] = pwd
        scraper_log(f"Using proxy: {proxy_server}")
        return config

    def close_browser(self):
        resources = [
            (self.context, "close"),
            (self.browser, "close"),
            (self.playwright, "stop"),
        ]
        self.context = None
        self.browser = None
        self.playwright = None
        self.page = None
        self.listings_page = None

        errors = []
        for resource, method_name in resources:
            if not resource:
                continue
            try:
                getattr(resource, method_name)()
            except Exception as e:
                errors.append(e)
        if errors:
            raise errors[0]

    def build_full_url(self, relative_url, base_url=None):
        """
        Build full URL from relative path.

        Args:
            relative_url: Relative URL path (e.g., "/jobs/123")
            base_url: Base URL to use. If None, uses listings_page.url or source["url"]

        Returns:
            Full URL string
        """
        if base_url is None:
            if self.listings_page:
                base_url = self.listings_page.url
            else:
                base_url = self.source["url"]

        parsed = urlparse(base_url)
        # Handle relative URLs that might already start with /
        if relative_url.startswith("/"):
            return f"{parsed.scheme}://{parsed.netloc}{relative_url}"
        else:
            return f"{parsed.scheme}://{parsed.netloc}/{relative_url}"

    def safe_wait_for_selector(self, page, selector, timeout=10000, required=False):
        """
        Wait for selector with error handling.

        Args:
            page: Playwright page object
            selector: CSS selector to wait for
            timeout: Timeout in milliseconds
            required: If True, raises exception on timeout. If False, returns False.

        Returns:
            True if selector found, False if timeout and required=False
        """
        try:
            page.wait_for_selector(selector, timeout=timeout)
            return True
        except Exception as e:
            if required:
                raise e
            return False

    def _close_page_safely(self, page):
        try:
            page.close()
        except Exception:
            pass

    def safe_open_job_page(self, job_url, wait_selector=None, timeout=10000, max_retries=3):
        """Open a job page and wait for selector. Returns (page, success).
        On success, caller is responsible for closing the page.
        On failure, the page is always closed before returning (None, False)."""
        full_url = job_url if job_url.startswith("http") else self.build_full_url(job_url)

        for attempt in range(1, max_retries + 1):
            job_page = None
            try:
                assert self.context is not None
                job_page = self.context.new_page()
                job_page.goto(full_url, wait_until="domcontentloaded")

                if wait_selector and not self.safe_wait_for_selector(job_page, wait_selector, timeout):
                    raise Exception(f"Selector '{wait_selector}' not found")

                return (job_page, True)
            except Exception as e:
                scraper_log(f"\tError opening job page ({attempt}/{max_retries}): {e} — {full_url}")
                if attempt == max_retries:
                    # Only upload a screenshot after all retries are exhausted
                    try:
                        if job_page:
                            self.upload_error_screenshot_from_page(job_page)
                    except Exception:
                        pass
                self._close_page_safely(job_page)
                if attempt < max_retries:
                    time.sleep(attempt)
                else:
                    return (None, False)

        return (None, False)

    def create_job_dict(self, **kwargs):
        """
        Create standardized job dict with all expected fields.
        All data is normalized before being returned.
        Location parsing happens during normalization (with Geocodio rate limiting).

        Args:
            **kwargs: Job data fields (job_title, date_posted, description, etc.)

        Returns:
            Dictionary with standardized and normalized job structure
        """
        # Create raw dict first
        raw_job = {
            "job_title": kwargs.get("job_title"),
            "date_posted": kwargs.get("date_posted"),
            "close_date": kwargs.get("close_date"),
            "description": kwargs.get("description", ""),
            "summary": kwargs.get("summary"),
            "organization": kwargs.get("organization"),
            "location": kwargs.get("location"),
            "listing_url": kwargs.get("listing_url"),
            "employment_type": kwargs.get("employment_type"),
            "wage": kwargs.get("wage"),
            "language": kwargs.get("language", "en"),
        }

        # Normalize all fields
        return normalize_job_data(raw_job)
