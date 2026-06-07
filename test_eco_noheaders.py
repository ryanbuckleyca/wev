import sys, os
sys.path.insert(0, os.path.abspath('wev-scraper'))

from utils.db import supabase
from scrapers.ecocanada import EcoCanadaScraper

class NoHeadersEcoScraper(EcoCanadaScraper):
    def _build_context_headers(self, use_real_chrome: bool):
        return {}, None

sources = supabase.table('sources').select('*').execute().data
eco_source = next((s for s in sources if 'ECO Canada' in s['name']), None)

if eco_source:
    scraper = NoHeadersEcoScraper(eco_source)
    try:
        jobs = scraper.fetch_jobs()
        print(f"✅ Found {len(jobs)} jobs with empty headers")
    except Exception as e:
        print(f"❌ Failed: {e}")
        scraper.upload_error_screenshot_from_page(scraper.listings_page)
    finally:
        scraper.close_browser()
