from functools import lru_cache
from supabase import create_client, Client
from datetime import datetime, timezone
from settings import get_supabase_settings
from utils.env import is_truthy_env
from utils.log import scraper_log
from utils.url import get_listing_url_variant
from lib.compensation import extract_and_guard

@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """Create the Supabase client lazily so imports stay side-effect free."""
    config = get_supabase_settings()
    return create_client(config.url, config.secret_key)


def get_supabase_url() -> str:
    """Return the active Supabase URL for the current runtime mode."""
    return get_supabase_settings().url


def reset_supabase_client_cache() -> None:
    """Clear the cached Supabase client for tests or controlled reinitialization."""
    get_supabase_client.cache_clear()


class _LazySupabaseClient:
    """Proxy that defers client creation until the first actual DB call."""

    def __getattr__(self, attr: str):
        return getattr(get_supabase_client(), attr)


supabase = _LazySupabaseClient()

PAGE_SIZE = 1000


def fetch_all_rows(
    table: str,
    columns: str,
    *,
    filters: dict | None = None,
    start_offset: int = 0,
    order_by: str = "id",
    desc: bool = False,
) -> list[dict]:
    """Fetch every row from a Supabase table, paginating in batches of PAGE_SIZE.

    Args:
        table: Table name (e.g. "jobs").
        columns: Comma-separated column list for .select().
        filters: Optional dict of {column: value} equality filters.
        start_offset: Number of rows to skip before fetching (pushed to the DB).
        order_by: Column for deterministic ordering (required for correct pagination).
            Default "id" works for jobs, profiles, etc.
        desc: If True, order descending.

    Returns a flat list of row dicts.
    """
    all_rows: list[dict] = []
    offset = start_offset
    while True:
        query = supabase.table(table).select(columns).order(order_by, desc=desc).range(offset, offset + PAGE_SIZE - 1)
        if filters:
            for col, val in filters.items():
                query = query.eq(col, val)
        resp = query.execute()
        batch = resp.data or []
        all_rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return all_rows


def _job_row(job, source_id):
    """Build the dict used for insert/update (shared fields)."""
    row = {
        "source_id": source_id,
        "organization": job["organization"],
        "job_title": job["job_title"],
        "location": job["location"],
        "municipality": job.get("municipality"),
        "province": job.get("province"),
        "lat": job.get("lat"),
        "lng": job.get("lng"),
        "geocode_accuracy_type": job.get("geocode_accuracy_type"),
        "is_remote": job.get("is_remote", False),
        "work_type": job.get("work_type", "office"),
        "date_posted": job["date_posted"],
        "close_date": job["close_date"],
        "listing_url": job["listing_url"],
        "description": job["description"],
        "summary": job.get("summary"),
        "employment_type": job["employment_type"],
        "wage": job["wage"],
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "sse_rating": job.get("sse_rating"),
        "sse_details": job.get("sse_details"),
        "is_sse": job.get("is_sse"),
        "values": job.get("values") or [],
        "skills": job.get("skills") or [],
        "language": job.get("language") or "en",
    }

    # Populate structured compensation fields via LLM extraction
    wage_text = job.get("wage")
    if wage_text:
        try:
            extraction = extract_and_guard(wage_text)
            meta = {
                "confidence": extraction.confidence,
                "raw": wage_text,
                "currency": extraction.currency,
            }
            if extraction.raw_note is not None:
                meta["notes"] = extraction.raw_note
            row["unit_text"] = extraction.unit_text
            row["min_value"] = extraction.min_value
            row["max_value"] = extraction.max_value
            row["hours_per_week"] = extraction.hours_per_week
            row["compensation_meta"] = meta
        except Exception as e:
            scraper_log(f"Compensation extraction failed for wage={wage_text!r}: {e}")
            row["unit_text"] = None
            row["min_value"] = None
            row["max_value"] = None
            row["hours_per_week"] = None
            row["compensation_meta"] = None
    else:
        row["unit_text"] = None
        row["min_value"] = None
        row["max_value"] = None
        row["hours_per_week"] = None
        row["compensation_meta"] = None

    return row


def _extract_response_data(response):
    """Normalize Supabase response to a single dict or None."""
    data = None
    if response is None:
        return None
    elif isinstance(response, dict):
        data = response.get('data')
    elif hasattr(response, 'data'):
        data = getattr(response, 'data')
    if isinstance(data, list) and len(data) > 0:
        data = data[0]
    return data if isinstance(data, dict) else None


_EXISTING_JOB_COLUMNS = "id, listing_url, summary, sse_rating, sse_details, is_sse"


def _find_existing_job(job):
    """Look up an existing job by listing_url (exact match, then trailing-slash variant).

    Raises on DB errors so callers fail closed rather than silently inserting duplicates.
    """
    url = (job.get("listing_url") or "").strip()
    if not url:
        return None

    resp = (
        supabase.table("jobs")
        .select(_EXISTING_JOB_COLUMNS)
        .eq("listing_url", url)
        .order("id")
        .limit(1)
        .execute()
    )
    found = _extract_response_data(resp)
    if found:
        return found

    variant = get_listing_url_variant(url)
    resp = (
        supabase.table("jobs")
        .select(_EXISTING_JOB_COLUMNS)
        .eq("listing_url", variant)
        .order("id")
        .limit(1)
        .execute()
    )
    found = _extract_response_data(resp)
    if found:
        return found

    return None


def _build_update_row(job, source_id, existing_data):
    """Build an update payload that preserves existing fields unless explicitly overridden.
    
    Uses field_management module to determine which fields to preserve based on
    environment variables and processing flags.
    """
    row = _job_row(job, source_id)
    
    # Use field management to preserve appropriate fields
    from utils.field_management import build_update_row_with_field_preservation
    return build_update_row_with_field_preservation(row, source_id, existing_data)


def save_job(job, source_id):
    """Insert job if not exists (deduplicate by listing_url). If SHOULD_OVERRIDE_EXISTING is set, update existing row instead of skipping.
    
    Returns a tuple (status, job_id) where status is "added", "updated", "skipped", or "error",
    and job_id is the DB uuid (or None if skipped/error).
    """
    if not job.get("organization") or not job.get("job_title") or not job.get("listing_url"):
        scraper_log(f"Skipping job due to missing required fields: {job.get('listing_url') or 'no_url'}")
        return "skipped", None

    scraper_log(f"Checking for existing job with URL: {job['listing_url']}")
    try:
        existing_data = _find_existing_job(job)
        if existing_data:
            scraper_log(f"Existing data found: {existing_data['id']}")
    except Exception as e:
        scraper_log(f"Error checking for existing job: {e}")
        return "skipped", None

    if existing_data:
        override_mode = is_truthy_env("SHOULD_OVERRIDE_EXISTING")
        
        if override_mode:
            scraper_log(f"Job already exists, overwriting (SHOULD_OVERRIDE_EXISTING=1): {job['listing_url']}")
            try:
                row = _build_update_row(job, source_id, existing_data)
                supabase.table("jobs").update(row).eq("id", existing_data["id"]).execute()
                scraper_log(f"✅ Successfully overwrote existing job: {job['listing_url']}")
                return "updated", existing_data["id"]
            except Exception as e:
                scraper_log(f"❌ Error overwriting job: {e}")
                return "skipped", None
        else:
            scraper_log(f"Job already exists, skipping (SHOULD_OVERRIDE_EXISTING=0): {job['listing_url']}")
            return "skipped", None

    scraper_log(f"Inserting new job: {job['listing_url']}")
    try:
        resp = supabase.table("jobs").insert(_job_row(job, source_id)).execute()
        inserted_id = (resp.data or [{}])[0].get("id") if resp.data else None
        scraper_log(f"Successfully inserted new job: {job['listing_url']}")
        return "added", inserted_id
    except Exception as e:
        err_str = str(e)
        scraper_log(f"Insert failed, attempting recovery lookup: {err_str}")
        if "unique" in err_str.lower() or "duplicate" in err_str.lower() or "constraint" in err_str.lower():
            existing = _find_existing_job(job)
            if existing and existing.get("id"):
                scraper_log(f"Found existing row after failed insert, updating id={existing['id']}")
                try:
                    row = _build_update_row(job, source_id, existing)
                    supabase.table("jobs").update(row).eq("id", existing["id"]).execute()
                    scraper_log(f"Updated existing job after insert conflict: {job['listing_url']}")
                    return "updated", existing["id"]
                except Exception as e2:
                    scraper_log(f"Failed to update existing row after insert conflict: {e2}")
        return "error", None

def log_scrape_run(source_id, jobs_found, jobs_added, errors=None):
    """Record a scrape run"""
    supabase.table("scrape_runs").insert({
        "source_id": source_id,
        "jobs_found": jobs_found,
        "jobs_added": jobs_added,
        "errors": errors,
        "run_at": datetime.now(timezone.utc).isoformat()
    }).execute()
