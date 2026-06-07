import sys, os
sys.path.insert(0, os.path.abspath('wev-scraper'))
from db import get_db
for s in get_db().table('sources').select('name, url').execute().data:
    print(f"{s['name']}: {s['url']}")
