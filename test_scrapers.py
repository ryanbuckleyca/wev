import sys, os
sys.path.insert(0, os.path.abspath('wev-scraper'))

from utils.db import supabase
from scrapers.ecocanada import EcoCanadaScraper
from scrapers.coco import CocoScraper

print("Testing EcoCanada...")
sources = supabase.table('sources').select('*').execute().data
eco_source = next((s for s in sources if 'Eco' in s['name']), None)
coco_source = next((s for s in sources if 'COCo' in s['name'] or 'COCO' in s['name']), None)

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

if coco_source:
    print(f"COCo Source URL: {coco_source['url']}")
    scraper = CocoScraper(coco_source)
    try:
        jobs = scraper.fetch_jobs()
        print(f"✅ COCo found {len(jobs)} jobs")
    except Exception as e:
        print(f"❌ COCo failed: {e}")
    finally:
        scraper.close_browser()

