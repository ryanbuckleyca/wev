# Scrapers

This directory contains the site-specific scraper implementations extending `BaseScraper` ([scrapers/base.py](base.py)).

## Architecture

Each site scraper inherits from `BaseScraper`, which provides standard lifecycle management and extraction utilities:

- **Browser Lifecycle**: Launches Playwright with stealth settings and headers mimicking desktop Chrome to avoid bot detection.
- **Error Detection & Retries**: Automatically detects HTTP 403/404 errors, bot challenge screens, and page load timeouts.
- **Pagination**: Supports both numeric pagination (`/page/N/`) and dynamic buttons ("Load More").
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

2. Override extraction hooks as needed (e.g. `extract_wage`, `setup_pagination`, `get_listing_data`).
3. Register the scraper in `scrapers/registry.py`.
