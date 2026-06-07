import re
from playwright.sync_api import sync_playwright

def _accept_consent_popup(page):
    consent_container_selector = (
        '[class*="consent"], [class*="cookie"], [id*="consent"], '
        '#accept-all, #acceptAll, .accept-all, [data-cky-tag="accept-button"]'
    )
    for try_click in [
        lambda: page.get_by_role("button", name=re.compile(r"accept all|accept", re.I)).first.click(timeout=3000),
        lambda: page.get_by_role("button", name=re.compile(r"allow", re.I)).first.click(timeout=3000),
        lambda: page.locator('[class*="consent"] button, [class*="cookie"] button, [id*="consent"] button').first.click(timeout=3000),
        lambda: page.locator('#accept-all, #acceptAll, .accept-all, [data-cky-tag="accept-button"]').first.click(timeout=3000),
    ]:
        try:
            try_click()
            try:
                page.wait_for_selector(consent_container_selector, state="hidden", timeout=3000)
            except Exception:
                pass
            return
        except Exception:
            continue

def _dismiss_overlay(page):
    eco_impact_selector = '[class*="overlay"]:has-text("ECO IMPACT"), [class*="modal"]:has-text("ECO IMPACT")'
    for try_click in [
        lambda: page.locator('[aria-label="Close"]').first.click(timeout=2000),
        lambda: page.locator('[aria-label="close"]').first.click(timeout=2000),
        lambda: page.get_by_role("button", name=re.compile(r"close|dismiss|×|\bx\b", re.I)).first.click(timeout=2000),
        lambda: page.get_by_text("×", exact=True).first.click(timeout=2000),
        lambda: page.locator('button[class*="close"], [class*="close"]').first.click(timeout=2000),
        lambda: page.locator('.modal-close, [data-dismiss="modal"]').first.click(timeout=2000),
        lambda: page.locator('[title="Close"], [title="close"]').first.click(timeout=2000),
        lambda: page.locator('[class*="overlay"]').filter(has_text="ECO IMPACT").locator("button").first.click(timeout=2000),
        lambda: page.locator('[class*="modal"]').filter(has_text="ECO IMPACT").locator("button").first.click(timeout=2000),
    ]:
        try:
            try_click()
            try:
                page.wait_for_selector(eco_impact_selector, state="hidden", timeout=2000)
            except Exception:
                pass
            return
        except Exception:
            continue
    try:
        page.keyboard.press("Escape")
    except Exception:
        pass

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 1400})
    page.goto("https://eco.ca/jobs", wait_until="networkidle")
    
    print("URL before popups:", page.url)
    _accept_consent_popup(page)
    _dismiss_overlay(page)
    
    print("URL after popups:", page.url)
    
    try:
        loc = page.get_by_placeholder("City or Province or Remote")
        loc.wait_for(state="attached", timeout=5000)
        print("Found input. Count:", loc.count())
    except Exception as e:
        print("Exception:", str(e))
        print("Saving screenshot to /Users/ry/code/wev/screenshot.png")
        page.screenshot(path="/Users/ry/code/wev/screenshot.png")
    
    browser.close()
