import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        print("Navigating to job search...")
        await page.goto("https://workinculture.ca/job-search/", wait_until="networkidle")
        
        print("Waiting for ais-Hits-list...")
        try:
            await page.wait_for_selector(".ais-Hits-list", timeout=10000)
            items = await page.locator(".ais-Hits-list article").all()
            print(f"Found {len(items)} items using .ais-Hits-list article")
        except Exception as e:
            print(f"Timeout or error: {e}")
            print("Dumping all classes that contain 'ais'...")
            classes = await page.evaluate('''() => {
                const els = document.querySelectorAll('[class*="ais"]');
                return Array.from(els).map(e => e.className);
            }''')
            print("Classes:", set(classes))
            
            # Look for job listing titles
            titles = await page.locator("article").all_inner_texts()
            print(f"Found {len(titles)} articles")
            if titles:
                print("First article:", titles[0][:200])

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
