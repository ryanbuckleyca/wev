from unittest.mock import MagicMock, patch

from utils.storage import (
    _normalize_storage_path,
    build_public_storage_url,
    slug,
    upload_error_screenshot,
)


def test_slug():
    assert slug("Tech Corp") == "tech-corp"
    assert slug("  Some   Special !@# Characters  ") == "some-special-characters"
    assert slug(None) == "unknown"
    assert slug("") == "unknown"

@patch("utils.storage.scraper_log")
def test_upload_error_screenshot(mock_log):
    mock_supabase = MagicMock()
    mock_storage = mock_supabase.storage.from_.return_value
    
    # Success
    res = upload_error_screenshot(mock_supabase, b"image", "source")
    assert res.startswith("errors/")
    mock_storage.upload.assert_called_once()
    
    # Empty bytes
    assert upload_error_screenshot(mock_supabase, b"", "source") is None
    
    # Error
    mock_storage.upload.side_effect = Exception("upload fail")
    assert upload_error_screenshot(mock_supabase, b"image", "source") is None
    mock_log.assert_called_with("Failed to upload screenshot: Exception: upload fail")

def test_normalize_storage_path():
    bucket = "Scraper screenshots"
    # Raw path
    assert _normalize_storage_path("errors/1.png", bucket) == "errors/1.png"
    # Full URL
    url = f"https://supabase.com/storage/v1/object/public/{bucket}/errors/1.png"
    assert _normalize_storage_path(url, bucket) == "errors/1.png"
    # Full URL with encoded bucket
    url_enc = "https://supabase.com/storage/v1/object/public/Scraper%20screenshots/errors/1.png"
    assert _normalize_storage_path(url_enc, bucket) == "errors/1.png"
    # Already relative
    assert _normalize_storage_path("Scraper screenshots/errors/1.png", bucket) == "errors/1.png"
    # Empty
    assert _normalize_storage_path(None, bucket) is None
    assert _normalize_storage_path(" ", bucket) is None

def test_build_public_storage_url():
    supabase_url = "https://project.supabase.co"
    bucket = "Scraper screenshots"
    path = "errors/1.png"
    
    res = build_public_storage_url(supabase_url, bucket, path)
    assert "project.supabase.co/storage/v1/object/public/Scraper%20screenshots/errors/1.png" in res
    
    # Handle full URL as path
    url = f"{supabase_url}/storage/v1/object/public/Scraper%20screenshots/errors/1.png"
    res2 = build_public_storage_url(supabase_url, bucket, url)
    assert res2 == url
    
    # Empty inputs
    assert build_public_storage_url("", bucket, path) is None
    assert build_public_storage_url(supabase_url, bucket, None) is None
