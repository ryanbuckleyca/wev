import sys, os
sys.path.insert(0, os.path.abspath('wev-scraper'))

from utils.db import supabase
from scrapers.ecocanada import EcoCanadaScraper

sources = supabase.table('sources').select('*').execute().data
eco_source = next((s for s in sources if 'ECO Canada' in s['name']), None)

if eco_source:
    print(f"Eco Source URL: {eco_source['url']}")
    scraper = EcoCanadaScraper(eco_source)
    try:
        jobs = scraper.fetch_jobs()
        print(f"✅ Eco Canada found {len(jobs)} jobs")
    except Exception as e:
        print(f"❌ Eco Canada failed: {e}")
    finally:
        scraper.close_browser()

