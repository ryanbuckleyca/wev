from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://eco.ca/jobs")
    loc = page.get_by_placeholder("City or Province or Remote", exact=False)
    print("Count exact=False:", loc.count())
    loc2 = page.get_by_placeholder("City or Province or Remote")
    print("Count exact=True:", loc2.count())
    print("is_visible:", loc2.first.is_visible())
    
    # Try to find the COCo url from the db
    import sys, os
    sys.path.insert(0, os.path.abspath('wev-scraper'))
    from db import get_db
    for s in get_db().table('sources').select('name, url').execute().data:
        if 'COCo' in s['name'] or 'coco' in s['url'].lower():
            print(f"COCo URL: {s['url']}")

    browser.close()
