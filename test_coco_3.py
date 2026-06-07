from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://coco-net.org/community-jobs/")
    print("Page title:", page.title())
    print("Listing count:", page.locator("ul.job_listings li.job_listing").count())
    if page.locator("ul.job_listings li.job_listing").count() == 0:
        print("HTML snippet:")
        print(page.content()[:1000])
        # Find any link containing 'job'
        print("Links with job:")
        for link in page.locator("a", has_text="job").all() + page.locator("a", has_text="Job").all():
            print(link.get_attribute("href"), link.inner_text())
    browser.close()
