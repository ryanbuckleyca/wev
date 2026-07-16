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
        return "https://ecoworks.eco.ca/jobs"

    def open_listings_page(self, page, filter_value=None):
        """Navigate to the main listings page."""
        url = self.get_listings_url(filter_value)
        if filter_value:
            url += f"?location={filter_value}"
        page.goto(url)
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

    def extract_job_fields(self, page, listing_data, index):
        """Extract job fields directly from the JBoard window.job JSON object."""
        job_data = page.evaluate("window.job")
        if not job_data:
            raise Exception("window.job not found on page")

        job_title = job_data.get("title")
        description = job_data.get("description")
        
        emp = job_data.get("employer", {})
        organization = emp.get("name")
        
        location = job_data.get("location")
        
        min_comp = job_data.get("min_compensation")
        max_comp = job_data.get("max_compensation")
        currency = (job_data.get("compensation_currency") or "CAD").upper()
        time_frame = job_data.get("compensation_time_frame") or ""
        
        wage = None
        if min_comp and max_comp:
            wage = f"${min_comp} - ${max_comp} {currency} {time_frame}".strip()
        elif min_comp:
            wage = f"${min_comp} {currency} {time_frame}".strip()
            
        emp_type = job_data.get("employmentType") or job_data.get("job_type", {}).get("title")
        if emp_type:
            emp_type = emp_type.replace("_", " ")
        
        date_str = job_data.get("posted_at") or job_data.get("datePosted")
        if date_str:
            date_str = date_str.split("T")[0]
            
        close_date = job_data.get("validThrough")
        if close_date:
            close_date = close_date.split("T")[0]

        job_url = listing_data.get("listing_url") or page.url

        fields = {
            "job_url": job_url,
            "job_title": job_title,
            "organization": organization,
            "description": description,
            "wage": wage,
            "location": location,
            "date_posted": date_str,
            "close_date": close_date,
            "employment_type": emp_type,
            "listing_url": job_url,
        }

        job_dict = self.create_job_dict(language=getattr(self, "language", "en"), **fields)
        self.jobs.append(job_dict)
