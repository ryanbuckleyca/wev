from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://coco.ca") # wait, let me check the actual url. COCo job board is often https://coco-net.org/jobs
    import time; time.sleep(5)
    print("Page title:", page.title())
    print("URL:", page.url)
    browser.close()
