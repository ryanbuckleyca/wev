import sys, os
sys.path.insert(0, os.path.abspath('wev-scraper'))

from utils.db import supabase
from scrapers.coco import CocoScraper

sources = supabase.table('sources').select('*').execute().data
coco_source = next((s for s in sources if 'COCO' in s['name']), None)

if coco_source:
    scraper = CocoScraper(coco_source)
    page = scraper.start_browser(headless=True)
    try:
        scraper.open_listings_page(page)
        # Just grab the whole body html
        html = page.locator("main, #main, .main-content, body").first.inner_html()
        import json
        with open("coco_body.html", "w") as f:
            f.write(html)
        print("Wrote body HTML to coco_body.html")
    finally:
        scraper.close_browser()
