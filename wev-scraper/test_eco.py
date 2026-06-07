import sys

from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        extra_http_headers={
            "Sec-CH-UA": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            "Sec-CH-UA-Mobile": "?0",
            "Sec-CH-UA-Platform": '"macOS"',
        }
    )
    page = context.new_page()
    try:
        page.goto("https://eco.ca/new-practitioners/employment-support/job-board/", wait_until="domcontentloaded", timeout=30000)
        print("Page loaded successfully.")
    except Exception as e:
        print(f"Error loading page: {e}")
        sys.exit(1)
