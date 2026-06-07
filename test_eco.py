from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://eco.ca/jobs")
    import time; time.sleep(5)
    print("Inputs on page:")
    for el in page.locator("input").all():
        print(f"placeholder='{el.get_attribute('placeholder')}' type='{el.get_attribute('type')}' id='{el.get_attribute('id')}'")
    browser.close()
