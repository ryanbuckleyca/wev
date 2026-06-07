import sys, os
sys.path.insert(0, os.path.abspath('wev-scraper'))
from utils.db import supabase
resp = supabase.table('sources').select('name, url').execute()
for r in resp.data:
    if 'coco' in r['name'].lower() or 'coco' in r['url'].lower():
        print(f"COCo: {r}")
