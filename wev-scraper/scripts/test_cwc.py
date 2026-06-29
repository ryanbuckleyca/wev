import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto("https://workinculture.ca/job-search/", wait_until="networkidle")
        
        # Check for listing items
        items = await page.locator("ol.ais-Hits-list article").all()
        print(f"Found {len(items)} items")
        
        if items:
            for item in items[:2]:
                data_ref = await item.get_attribute("data-ref")
                print(f"data-ref: {data_ref}")
                
                # Check for anchor tag
                a_tag = await item.locator("a").first.get_attribute("href")
                print(f"a_tag href: {a_tag}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
