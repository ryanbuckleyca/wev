from scrapers.base import BaseScraper


class CocoScraper(BaseScraper):
    is_chronological = True
    # COCo is a Montréal board for Québec community groups. Locations are often
    # a bare street address ("1950 Grand Trunk, Local 110"), which Geocodio
    # otherwise matches in another province.
    default_province = "QC"
    listing_selector = "ul.job_listings li.job_listing"
    job_wait_selector = "article"

    SELECTORS = {
        "job_title": "h1.entry-title",
        "date_posted": (".date-posted time", "text", "Posted on"),
        "description": (".job_description", "html"),
        "close_date": (".application-deadline", "text", "Closes: "),
        "location": ".location",
        "wage": ".salary",
        "organization": ".company .name strong",
        "employment_type": ".job-type",
    }
