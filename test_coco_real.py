from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://coco-net.org/jobs/")
    print("Page title:", page.title())
    print("Listing count:", page.locator("ul.job_listings li.job_listing").count())
    print("HTML:")
    print(page.content()[:1000])
    browser.close()
