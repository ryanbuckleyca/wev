from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://coco-net.org/job-postings/")
    print("Page title:", page.title())
    print("Listing count:", page.locator("ul.job_listings li.job_listing").count())
    if page.locator("ul.job_listings li.job_listing").count() == 0:
        print("HTML snippet:")
        print(page.content()[:1000])
        print("Classes on body:", page.locator("body").get_attribute("class"))
    browser.close()
