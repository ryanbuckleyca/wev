import json
from scrapers.workinculture import WorkInCultureScraper
from llm.factory import get_unified_processor
from settings import load_env_file
from pathlib import Path
import os

def run_test():
    # Ensure env is loaded
    load_env_file(Path(".env"))
    
    source = {
        "id": "test-uuid-1234",
        "name": "Work In Culture",
        "url": "https://workinculture.ca/job-search/",
        "slug": "workinculture"
    }

    scraper = WorkInCultureScraper(source)
    scraper._max_jobs = 3
    scraper.force_headed = True

    print("Fetching jobs...")
    jobs = scraper.fetch_jobs()
    
    for i, job in enumerate(jobs):
        job["id"] = f"mock-job-id-{i}"
    
    print(f"Fetched {len(jobs)} jobs. Running unified processor on 1 job...")
    
    # We might need to ensure LLM environment variables are present
    if not os.environ.get("GOOGLE_API_KEY"):
        print("Warning: GOOGLE_API_KEY not set")
    
    try:
        processor = get_unified_processor()
        result = processor.process_jobs(jobs[:1])
        print("\n--- UNIFIED PROCESSOR RESULTS ---\n")
        print(json.dumps(result, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"Error during processing: {e}")

if __name__ == "__main__":
    run_test()
