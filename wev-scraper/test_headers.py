
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel="chrome")
    context = browser.new_context()
    page = context.new_page()
    page.goto("https://httpbin.org/headers")
    print(page.inner_text("body"))
