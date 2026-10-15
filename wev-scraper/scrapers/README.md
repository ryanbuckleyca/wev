# Scrapers

This directory contains the site-specific scraper implementations extending `BaseScraper` ([scrapers/base.py](base.py)).

## Architecture

Each site scraper inherits from `BaseScraper`, which provides standard lifecycle management and extraction utilities:

- **Browser Lifecycle**: Launches Playwright with stealth settings and headers mimicking desktop Chrome to avoid bot detection.
- **Error Detection & Retries**: Automatically detects HTTP 403/404 errors, bot challenge screens, and page load timeouts.
- **Pagination**: Site-specific; `BaseScraper.fetch_jobs()` stops when `has_next_page(page)` returns `False` (the default). Multi-page scrapers must override `has_next_page(page)` and `go_next_page(page)` (e.g. for numeric `/page/N/` URLs or dynamic "Load More" buttons).
- **Deduplication**: Checks URLs against database records to avoid redundant page loads unless explicitly instructed to overwrite existing rows.
- **Field Normalization**: Standardizes job titles, organizations, locations, dates, wages, and employment types via `normalize_job_data`.

## Adding a New Scraper

1. Create `scrapers/<site>.py` with a class extending `BaseScraper`:

   ```python
   from scrapers.base import BaseScraper


   class NewSiteScraper(BaseScraper):
       listing_selector = ".job-card"          # CSS selector for job items on listing page
       job_wait_selector = ".job-description"  # CSS selector to wait for on detail page
       is_chronological = True                 # Stop early when encountering older jobs

       SELECTORS = {
           "job_title": "h1.title",
           "date_posted": ".date",
           "description": (".content", "html"),
           "location": ".location",
       }
   ```

2. Override extraction and pagination hooks as needed (e.g. `has_next_page`, `go_next_page`, `setup_pagination`, `extract_wage`, `get_listing_data`).
3. Register the scraper in `scrapers/registry.py`.
