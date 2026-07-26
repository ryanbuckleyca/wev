from scrapers.base import BaseScraper


class EcoCanadaScraper(BaseScraper):
    """Scraper for the new JBoard-based Eco Canada jobs platform."""
    is_chronological = True
    
    # Start on the jobs listing page to ensure we get pagination
    listing_selector = ".job-listings-item"
    
    # Wait for the script tag containing the job data to be available
    job_wait_selector = ".job-inner"

    filter_values = ["Ontario", "Quebec"]

    def get_listings_url(self, filter_value=None):
        url = "https://ecoworks.eco.ca/jobs"
        if filter_value:
            url += f"?location={filter_value}"
        return url

    def open_listings_page(self, page, filter_value=None):
        """Navigate to the main listings page."""
        page.goto(self.get_listings_url(filter_value))
        page.wait_for_selector(self.listing_selector, state="attached", timeout=30000)

    def has_next_page(self, page):
        """Return True if the pagination widget has an enabled next-page button."""
        try:
            btn = page.locator(".pagination .page-item a[rel='next']").first
            return btn.count() > 0
        except Exception:
            return False

    def go_next_page(self, page):
        """Click the next pagination button and wait for list to refresh."""
        next_btn = page.locator(".pagination .page-item a[rel='next']").first
        if next_btn.count() > 0:
            old_first_item_text = page.locator(self.listing_selector).first.inner_text()
            next_btn.click()
            page.wait_for_function(
                "(oldText) => {"
                "  const el = document.querySelector('.job-listings-item');"
                "  return el && el.innerText !== oldText;"
                "}",
                arg=old_first_item_text,
                timeout=15000
            )
            self.current_page_number += 1

    @staticmethod
    def _extract_wage(job_data: dict) -> str | None:
        min_comp = job_data.get("min_compensation")
        max_comp = job_data.get("max_compensation")
        currency = (job_data.get("compensation_currency") or "CAD").upper()
        time_frame = job_data.get("compensation_time_frame") or ""
        
        currency_suffix = f"{currency} {time_frame}".strip()

        if min_comp and max_comp:
            if min_comp == max_comp:
                return f"${min_comp} {currency_suffix}".strip()
            return f"${min_comp} - ${max_comp} {currency_suffix}".strip()
        elif min_comp:
            return f"${min_comp} {currency_suffix}".strip()
        elif max_comp:
            return f"${max_comp} {currency_suffix}".strip()
        return None

    @staticmethod
    def _extract_iso_date(job_data: dict, keys: list) -> str | None:
        for k in keys:
            date_str = job_data.get(k)
            if date_str:
                return str(date_str).split("T")[0]
        return None

    @staticmethod
    def _extract_employment_type(job_data: dict) -> str | None:
        emp_type = job_data.get("employmentType") or (job_data.get("job_type") or {}).get("title")
        if emp_type:
            return str(emp_type).lower().replace("_", "-").replace(" ", "-")
        return None

    def _parse_job_data(self, job_data: dict, listing_url: str) -> dict:
        emp = job_data.get("employer") or {}
        return {
            "job_url": listing_url,
            "job_title": job_data.get("title"),
            "organization": emp.get("name"),
            "website": emp.get("website") or emp.get("url") or emp.get("company_url"),
            "description": job_data.get("description"),
            "wage": self._extract_wage(job_data),
            "location": job_data.get("location"),
            "date_posted": self._extract_iso_date(job_data, ["posted_at", "datePosted"]),
            "close_date": self._extract_iso_date(job_data, ["validThrough"]),
            "employment_type": self._extract_employment_type(job_data),
            "listing_url": listing_url,
        }

    def extract_job_fields(self, page, listing_data, index):
        """Extract job fields directly from the JBoard window.job JSON object."""
        job_data = page.evaluate("window.job")
        if not job_data:
            raise Exception("window.job not found on page")

        job_url = listing_data.get("listing_url") or page.url
        fields = self._parse_job_data(job_data, job_url)

        job_dict = self.create_job_dict(language=getattr(self, "language", "en"), **fields)
        self.jobs.append(job_dict)
