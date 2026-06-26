"""Test: inspect CharityVillage detail page structure more thoroughly."""
import os
import json
os.environ['PLAYWRIGHT_SYNC_MODE'] = '1'

from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

# Just test 1 job from Toronto to find the right selectors
JOB_URL = "https://www.charityvillage.com/job/senior-development-officer-donor-engagement-breast-cancer-canada-319756"


def main():
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(headless=False, channel="chrome", args=[
                "--disable-blink-features=AutomationControlled",
            ])
        except Exception:
            browser = p.chromium.launch(headless=False)
        
        context = browser.new_context(
            viewport={"width": 1280, "height": 720},
            locale="en-CA",
        )
        Stealth().apply_stealth_sync(context)
        
        page = context.new_page()
        page.set_default_navigation_timeout(60_000)
        page.goto(JOB_URL, wait_until="domcontentloaded", timeout=60000)
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        page.wait_for_timeout(3000)
        
        # 1. Find ALL data-testid attributes on the page
        print("=== All data-testid attributes ===")
        testids = page.evaluate("""() => {
            const els = document.querySelectorAll('[data-testid]');
            return Array.from(els).map(el => ({
                testid: el.getAttribute('data-testid'),
                tag: el.tagName,
                text: el.innerText?.substring(0, 80) || '',
            }));
        }""")
        for t in testids:
            print(f"  [{t['tag']}] data-testid=\"{t['testid']}\" → {t['text'][:80]}")
        
        # 2. Find ALL SVG title elements anywhere on page
        print("\n=== All SVG <title> elements ===")
        svg_titles = page.evaluate("""() => {
            const titles = document.querySelectorAll('svg title');
            return Array.from(titles).map(t => {
                const svg = t.closest('svg');
                let siblingText = '';
                if (svg) {
                    let next = svg.nextElementSibling;
                    if (next) siblingText = next.textContent?.trim() || '';
                    // also get parent's text
                    const parent = svg.parentElement;
                    if (parent) {
                        // get all text nodes not in svg
                        const clone = parent.cloneNode(true);
                        clone.querySelectorAll('svg').forEach(s => s.remove());
                        siblingText = siblingText || clone.textContent?.trim() || '';
                    }
                }
                return {
                    titleText: t.textContent?.trim(),
                    siblingText: siblingText.substring(0, 100),
                };
            });
        }""")
        for s in svg_titles:
            print(f"  <title>{s['titleText']}</title> → \"{s['siblingText']}\"")
        
        # 3. Look for employment type / job type near the bottom
        print("\n=== Potential employment type areas ===")
        emp_areas = page.evaluate("""() => {
            // Strategy: look for text like "Full-Time", "Part-Time", "Volunteer", "Contract", etc.
            const keywords = ['Full-Time', 'Part-Time', 'Contract', 'Volunteer', 'Unpaid', 'Internship', 'Permanent'];
            const matches = [];
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const text = walker.currentNode.textContent.trim();
                for (const kw of keywords) {
                    if (text.includes(kw)) {
                        const parent = walker.currentNode.parentElement;
                        matches.push({
                            keyword: kw,
                            text: text.substring(0, 200),
                            parentTag: parent?.tagName,
                            parentClass: parent?.className?.substring(0, 100),
                            parentTestid: parent?.getAttribute('data-testid') || parent?.closest('[data-testid]')?.getAttribute('data-testid'),
                        });
                    }
                }
            }
            return matches;
        }""")
        for m in emp_areas:
            print(f"  [{m['keyword']}] in <{m['parentTag']}> class=\"{m.get('parentClass', '')}\" testid=\"{m.get('parentTestid', '')}\"")
            print(f"    text: {m['text'][:150]}")

        # 4. Look for salary info
        print("\n=== Salary/wage info ===")
        salary = page.evaluate("""() => {
            const els = document.querySelectorAll('[class*="salary"], [class*="Salary"], [data-testid*="salary"]');
            return Array.from(els).map(el => ({
                tag: el.tagName,
                class: el.className?.substring(0, 100),
                text: el.innerText?.substring(0, 200),
            }));
        }""")
        for s in salary:
            print(f"  <{s['tag']}> class=\"{s['class']}\" → {s['text']}")

        # 5. Check for the side-panel approach - load listing page with jobId
        print("\n=== Testing side-panel approach ===")
        panel_url = "https://www.charityvillage.com/jobs?geo_location=Toronto%2C+ON&lon=-79.347015&lat=43.65107&radius=25&locality=Toronto%2C+ON&locationType=locality&jobId=319756"
        page2 = context.new_page()
        page2.set_default_navigation_timeout(60_000)
        page2.goto(panel_url, wait_until="domcontentloaded", timeout=60000)
        try:
            page2.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        page2.wait_for_timeout(3000)
        
        panel_testids = page2.evaluate("""() => {
            const els = document.querySelectorAll('[data-testid]');
            return Array.from(els).map(el => ({
                testid: el.getAttribute('data-testid'),
                tag: el.tagName,
                text: el.innerText?.substring(0, 80) || '',
            }));
        }""")
        print(f"  Found {len(panel_testids)} data-testid elements in side-panel view")
        for t in panel_testids:
            print(f"  [{t['tag']}] data-testid=\"{t['testid']}\" → {t['text'][:80]}")
        
        # Check SVG titles in side panel
        panel_svg = page2.evaluate("""() => {
            const container = document.querySelector('[data-testid="job_detail_container"]');
            if (!container) return {error: 'no container'};
            const titles = container.querySelectorAll('svg title');
            return Array.from(titles).map(t => {
                const svg = t.closest('svg');
                const parent = svg?.parentElement;
                const clone = parent?.cloneNode(true);
                clone?.querySelectorAll('svg').forEach(s => s.remove());
                return {
                    titleText: t.textContent?.trim(),
                    parentText: clone?.textContent?.trim()?.substring(0, 100),
                };
            });
        }""")
        print(f"\n  Side-panel SVG fields: {json.dumps(panel_svg, indent=4)}")

        # Check employment type in side panel
        panel_emp = page2.evaluate("""() => {
            const btn = document.querySelector('[data-testid="job-apply-submit-button"]');
            if (!btn) return 'no apply button';
            let current = btn;
            let prev = current.previousElementSibling;
            while (!prev && current.parentElement) {
                current = current.parentElement;
                prev = current.previousElementSibling;
            }
            return prev ? prev.innerText?.trim() : 'no prev found';
        }""")
        print(f"  Side-panel employment type: {panel_emp}")

        page2.close()
        
        context.close()
        browser.close()

if __name__ == "__main__":
    main()
