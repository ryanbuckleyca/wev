import json
from scrapers.workinculture import WorkInCultureScraper

def run_test():
    source = {
        "id": "test-uuid-1234",
        "name": "Work In Culture",
        "url": "https://workinculture.ca/job-search/",
        "slug": "workinculture"
    }

    scraper = WorkInCultureScraper(source)
    # Patch max jobs
    scraper._max_jobs = 3

    print("Starting test scrape for Work In Culture...")
    jobs = scraper.fetch_jobs(headless=True)
    
    print("\n--- SCRAPE RESULTS ---\n")
    print(json.dumps(jobs, indent=2, ensure_ascii=False))
    print(f"\nTotal jobs scraped: {len(jobs)}")

if __name__ == "__main__":
    run_test()
