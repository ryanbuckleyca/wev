import pytest
from playwright.sync_api import sync_playwright

@pytest.fixture(scope="session")
def browser():
    pw = sync_playwright().start()
    b = pw.chromium.launch(headless=True)
    yield b
    b.close()
    pw.stop()

@pytest.fixture
def page(browser):
    p = browser.new_page()
    yield p
    p.close()
