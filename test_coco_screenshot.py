import sys, os
sys.path.insert(0, os.path.abspath('wev-scraper'))

from utils.db import supabase
from scrapers.coco import CocoScraper

sources = supabase.table('sources').select('*').execute().data
coco_source = next((s for s in sources if 'COCO' in s['name']), None)

if coco_source:
    print(f"COCo Source URL: {coco_source['url']}")
    scraper = CocoScraper(coco_source)
    try:
        jobs = scraper.fetch_jobs()
        print(f"✅ COCo found {len(jobs)} jobs")
    except Exception as e:
        print(f"❌ COCo failed: {e}")
        scraper.page.screenshot(path="/Users/ry/code/wev/coco_error.png")
        print("HTML snippet:")
        print(scraper.page.content()[:1000])
    finally:
        scraper.close_browser()
