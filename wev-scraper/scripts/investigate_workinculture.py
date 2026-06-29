import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        # Launch using Chrome channel to match the BaseScraper's approach for bypassing bot protection
        browser = await p.chromium.launch(headless=True, channel="chrome", args=[
            "--disable-blink-features=AutomationControlled"
        ])
        page = await browser.new_page(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
        )
        print("Navigating to Work In Culture job search...")
        await page.goto("https://workinculture.ca/job-search/", wait_until="networkidle")
        
        title = await page.title()
        print(f"Page Title: {title}")
        
        body_html = await page.locator("body").inner_html()
        print(f"Body length: {len(body_html)}")
        print(f"Body snippet: {body_html[:500]}")
        
        # Check for our target classes
        classes = await page.evaluate('''() => {
            const els = document.querySelectorAll('[class*="ais"]');
            return Array.from(els).map(e => e.className);
        }''')
        print("Algolia classes found:", set(classes))

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
