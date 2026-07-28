import os

# Ensure Supabase env vars exist before any module tries to create the client
# at import time. Real credentials come from .env; these are fallbacks for
# clean CI environments where .env doesn't exist.
os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-secret-key")

import pytest
from playwright.sync_api import sync_playwright

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


@pytest.fixture(autouse=True)
def _org_language_offline_by_default(monkeypatch):
    """Keep org-language classification offline unless a test opts in.

    ``classify_org_language`` fetches the website and builds an LLM provider by
    default. Without this guard, any test that reaches it (directly or via the
    assessor) would make real network calls / provider builds. Tests that want
    that behavior still override these boundaries themselves (e.g. patching
    ``_neutral_fetch``), which takes precedence over these no-op defaults.
    """
    try:
        import utils.organization_language as org_lang
    except Exception:
        return
    monkeypatch.setattr(org_lang, "_neutral_fetch", lambda _url: (None, None))
    monkeypatch.setattr(org_lang, "make_llm_language_fn", lambda: None)


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


def mock_requests_response(content: str | bytes, status_code: int = 200):
    """Create a mock requests.Response."""
    class MockResponse:
        def __init__(self):
            self.status_code = status_code
            self.content = content.encode("utf-8") if isinstance(content, str) else content
            self.text = content if isinstance(content, str) else content.decode("utf-8")
        def raise_for_status(self):
            if self.status_code >= 400:
                from requests.exceptions import HTTPError
                raise HTTPError(f"{self.status_code} Error")
        def __enter__(self):
            return self
        def __exit__(self, exc_type, exc_val, exc_tb):
            pass
    return MockResponse()
