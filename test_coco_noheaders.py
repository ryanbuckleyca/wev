import sys, os
sys.path.insert(0, os.path.abspath('wev-scraper'))

from utils.db import supabase
from scrapers.coco import CocoScraper

class NoHeadersCocoScraper(CocoScraper):
    def _build_context_headers(self, use_real_chrome: bool):
        return {}, None

sources = supabase.table('sources').select('*').execute().data
coco_source = next((s for s in sources if 'COCO' in s['name']), None)

if coco_source:
    scraper = NoHeadersCocoScraper(coco_source)
    try:
        jobs = scraper.fetch_jobs()
        print(f"✅ Found {len(jobs)} jobs with empty headers")
    except Exception as e:
        print(f"❌ Failed: {e}")
    finally:
        scraper.close_browser()
