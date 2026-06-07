import sys, os
sys.path.insert(0, os.path.abspath('wev-scraper'))

from utils.db import supabase
from scrapers.coco import CocoScraper

sources = supabase.table('sources').select('*').execute().data
coco_source = next((s for s in sources if 'COCO' in s['name']), None)

if coco_source:
    print(f"COCo Source URL: {coco_source['url']}")
    scraper = CocoScraper(coco_source)
    page = scraper.start_browser(headless=True)
    try:
        scraper.open_listings_page(page)
        # Try to find items manually without retry loop so we can catch HTML
        try:
            page.wait_for_selector(scraper.listing_selector, state="attached", timeout=10000)
            print("Found listings:", page.locator(scraper.listing_selector).count())
        except Exception as e:
            print(f"Timeout! Error: {e}")
            print("HTML snippet:")
            print(page.content()[:1500])
            print("---")
            print("Title:", page.title())
    finally:
        scraper.close_browser()
