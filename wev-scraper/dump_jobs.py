import json
from scrapers.charityvillage import CharityVillageScraper
from scrape import list_sources

def dump():
    cv_source = {"id": "mock-charityvillage", "slug": "charityvillage", "name": "Charity Village"}
    
    scraper = CharityVillageScraper(cv_source)
    # Patch to only do Toronto
    scraper.filter_values = ["Toronto, ON"]
    scraper.force_headed = True
    
    jobs = []
    # Fetch exactly 3
    for job in scraper.fetch_jobs():
        jobs.append(job)
        if len(jobs) >= 3:
            break
            
    print(json.dumps(jobs, indent=2, default=str))

if __name__ == "__main__":
    dump()
