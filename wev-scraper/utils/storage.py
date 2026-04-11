import re
from datetime import datetime
from urllib.parse import quote, unquote, urlparse

from utils.log import scraper_log

BUCKET = "Scraper screenshots"


def slug(name: str) -> str:
    """Safe path segment from source name."""
    return re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-") or "unknown"


def upload_error_screenshot(supabase_client, image_bytes: bytes, source_name: str) -> str | None:
    """
    Upload PNG screenshot to Supabase Storage.
    Returns the object path on success, None on failure.
    """
    if not image_bytes:
        return None
    date_prefix = datetime.utcnow().strftime("%Y-%m-%d")
    stamp = datetime.utcnow().strftime("%H%M%S")
    safe_name = slug(source_name)
    path = f"errors/{date_prefix}/{safe_name}-{stamp}.png"
    try:
        supabase_client.storage.from_(BUCKET).upload(
            path=path,
            file=image_bytes,
            file_options={"content-type": "image/png"},
        )
        return path
    except Exception as e:
        scraper_log(f"Failed to upload screenshot: {type(e).__name__}: {e}")
        return None


def _normalize_storage_path(path_or_url: str | None, bucket: str) -> str | None:
    """Normalize a storage object path.

    Accepts a raw path (e.g., "errors/..") or a full public URL and returns the
    object path relative to the bucket.
    """
    if not path_or_url:
        return None
    value = (path_or_url or "").strip()
    if not value:
        return None
    if value.startswith("http://") or value.startswith("https://"):
        parsed = urlparse(value)
        raw_path = parsed.path or ""
        # Try encoded and decoded bucket prefixes
        bucket_encoded = quote(bucket, safe="")
        prefixes = [
            f"/storage/v1/object/public/{bucket_encoded}/",
            f"/storage/v1/object/public/{bucket}/",
        ]
        for prefix in prefixes:
            if raw_path.startswith(prefix):
                return unquote(raw_path[len(prefix):])
        # Fallback: keep as-is if we can't parse a path
        return value
    bucket_prefix = f"{bucket}/"
    if value.startswith(bucket_prefix):
        return value[len(bucket_prefix):]
    return value


def build_public_storage_url(supabase_url: str, bucket: str, path_or_url: str) -> str | None:
    """Build a public URL from a bucket + object path.

    If a full URL is provided, we attempt to normalize it back to a path first.
    """
    if not supabase_url:
        return None
    path = _normalize_storage_path(path_or_url, bucket)
    if not path:
        return None
    # If normalization couldn't parse and returned a URL, trust it as-is.
    if path.startswith("http://") or path.startswith("https://"):
        return path
    base = supabase_url.rstrip("/")
    return f"{base}/storage/v1/object/public/{quote(bucket, safe='')}/{quote(path, safe='/')}"


def capture_and_upload_error_screenshot(
    page,
    supabase_client,
    supabase_url: str,
    source_name: str = "scraper",
) -> str | None:
    """Capture screenshot from page, upload to Supabase, print public URL. Never raises.

    Returns the public URL on success, None otherwise.
    """
    if not page:
        return None
    try:
        screenshot_bytes = page.screenshot(type="png", full_page=True)
        # If the screenshot is suspiciously small (blank white page), try waiting briefly
        if len(screenshot_bytes) < 5000:
            try:
                page.wait_for_load_state("domcontentloaded", timeout=3000)
            except Exception:
                pass
            screenshot_bytes = page.screenshot(type="png", full_page=True)
    except Exception as e:
        scraper_log(f"Could not capture screenshot: {e}")
        return None
    try:
        path = upload_error_screenshot(supabase_client, screenshot_bytes, source_name)
        if path:
            url = build_public_storage_url(supabase_url, BUCKET, path)
            if url:
                scraper_log(f"Error screenshot uploaded: {url}")
                return url
        scraper_log("Screenshot upload failed (ensure bucket 'Scraper screenshots' exists and is public).")
        return None
    except Exception as e:
        scraper_log(f"Screenshot upload failed: {e}")
        return None
