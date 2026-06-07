import sys, os
sys.path.insert(0, os.path.abspath('wev-scraper'))

from utils.db import supabase
from scrapers.coco import CocoScraper

class NoStealthCocoScraper(CocoScraper):
    def start_browser(self, headless=True, viewport=None):
        return super(CocoScraper, self).start_browser(headless=headless, viewport=viewport, use_stealth=False)

sources = supabase.table('sources').select('*').execute().data
coco_source = next((s for s in sources if 'COCO' in s['name']), None)

if coco_source:
    scraper = NoStealthCocoScraper(coco_source)
    try:
        jobs = scraper.fetch_jobs()
        print(f"✅ Found {len(jobs)} jobs with use_stealth=False")
    except Exception as e:
        print(f"❌ Failed: {e}")
    finally:
        scraper.close_browser()
