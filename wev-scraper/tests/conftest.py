import os
import sys

# Ensure Supabase env vars exist before any module tries to create the client
# at import time. Real credentials come from .env; these are fallbacks for
# clean CI environments where .env doesn't exist.
os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-secret-key")

import pytest
from playwright.sync_api import sync_playwright

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


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


def fixture_path(scraper_name, filename):
    return "file://" + os.path.join(FIXTURES_DIR, scraper_name, filename)


def make_source(url="https://example.com/jobs", name="Test Source", source_id="test-id"):
    return {"id": source_id, "url": url, "name": name}
