# Load environment variables FIRST - before any other imports that might need them
import sys
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
    load_dotenv()  # fallback: current directory
except ImportError:
    pass

# Ensure CI sees output immediately (no TTY = buffered otherwise)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)


def parse_args():
    """Parse CLI arguments and apply env-var side effects. Returns parsed namespace."""
    import argparse

    parser = argparse.ArgumentParser(
        prog="scrape.py",
        description="WEV job scraper",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument("--prod", "--use-prod", dest="use_prod", action="store_true",
                        help="Use production database")
    parser.add_argument("--provider", choices=["groq", "gemini"],
                        help="Force specific LLM provider")
    parser.add_argument("--within-weeks", type=int, default=2, metavar="N",
                        help="Age limit for job listings (default: 2)")
    parser.add_argument("--max-jobs-per-source", type=int, default=None, metavar="N",
                        help="Maximum jobs to scrape per source")
    parser.add_argument("--dry-run", "--dry", dest="dry_run", action="store_true",
                        help="Skip LLM calls and DB writes")
    parser.add_argument("--compare-only", "--compare", dest="compare_only", action="store_true",
                        help="Dry run + only process existing URLs")

    args = parser.parse_args()

    # compare-only implies dry-run
    if args.compare_only:
        args.dry_run = True

    # Apply env-var side effects so downstream modules pick them up
    if args.provider:
        os.environ["LLM_PROVIDER"] = args.provider
        print(f"Using provider: {args.provider}")

    if args.within_weeks != 2:
        os.environ["WITHIN_WEEKS"] = str(args.within_weeks)
        print(f"Using within weeks: {args.within_weeks}")

    if args.max_jobs_per_source is not None:
        os.environ["MAX_JOBS_PER_SOURCE"] = str(args.max_jobs_per_source)
        print(f"Using max jobs per source: {args.max_jobs_per_source}")

    if args.dry_run:
        os.environ["SHOULD_SUMMARIZE"] = "0"
        os.environ["SHOULD_CLASSIFY"] = "0"
        os.environ["SHOULD_TAG_VALUES"] = "0"
        os.environ["SHOULD_TAG_SKILLS"] = "0"
        os.environ["DRY_RUN"] = "1"
        if args.compare_only:
            os.environ["COMPARE_ONLY"] = "1"
            print("DRY RUN (COMPARE ONLY): will crawl live sites, skip summarization/classification/tagging "
                  "LLM calls and DB writes, and only open jobs with existing URLs in the DB. "
                  "Some other LLM-powered steps (e.g. location extraction) may still run.\n")
        else:
            print("DRY RUN: will crawl live sites but skip summarization/classification/tagging "
                  "LLM calls and DB writes. Some other LLM-powered steps may still run.\n")

    return args


def _confirm_prod_run():
    """Prompt for production confirmation. Exits if not confirmed."""
    confirm_env = os.environ.get("CONFIRM_PROD_RUN")
    if sys.stdin.isatty():
        print("\nWARNING: You are about to run the scraper against the PRODUCTION database.")
        print("This will create/modify real data.\n")
        resp = input("Type YES to continue, anything else to abort: ")
        if resp.strip() != "YES":
            print("Aborted — production run not confirmed.")
            sys.exit(1)
    elif confirm_env != "YES":
        print("Refusing to run against production in non-interactive mode. Set CONFIRM_PROD_RUN=YES to override.")
        sys.exit(1)


# Note: Argument parsing and production confirmation are handled in main() 
# to ensure side-effects don't happen when importing this module in tests.

# Import DB client after we've had a chance to set USE_PROD_DB from CLI
from utils.db import save_job, log_scrape_run, supabase, get_supabase_url, fetch_all_rows
from utils.env import is_truthy_env
from utils.log import scraper_log as _log
from utils.url import add_url_dedup_variants, normalize_listing_url
from scrapers.ecocanada import EcoCanadaScraper
from scrapers.goodwork import GoodWorkScraper
from scrapers.coco import CocoScraper
from scrapers.csi import CSIScraper
from scrapers.centraide import CentraideScraper
from scrapers.macommunaute import MaCommunauteScraper

import traceback

os.environ['PLAYWRIGHT_SYNC_MODE'] = '1'

SCRAPER_MAP = {
    "eb5a9e52-b626-4539-8539-981240f2dbee": EcoCanadaScraper,
    "d644049f-7186-4b7e-8860-adf69a4bd927": GoodWorkScraper,
    "4bbc9bac-76ae-4b2e-bd4e-ac67f739ac2a": CocoScraper,
    "a7154a94-7c95-442f-811a-12f9a62e5332": CSIScraper,
    "c068cbc6-90a5-45cb-95a1-a7281dd76198": CentraideScraper,
    "01a58f5e-f47c-4310-a2d1-6627a57e2071": MaCommunauteScraper,
    "394fd635-bf74-463a-9e74-b17405a8b688": MaCommunauteScraper,
}

CHECKED_FIELDS = [
    "job_title", "organization", "location", "date_posted",
    "wage", "description", "employment_type", "listing_url",
]
COMPARE_FIELDS = ["job_title", "organization", "location", "wage", "employment_type", "date_posted"]

# Read once from env so all helpers below use a consistent value
DRY_RUN = os.environ.get("DRY_RUN") == "1"
COMPARE_ONLY = os.environ.get("COMPARE_ONLY") == "1"


# ---- Feature flag logging ----

_SIMPLE_FEATURE_FLAGS = [
    ("SHOULD_OVERRIDE_EXISTING", "Overriding existing entries"),
    ("SHOULD_RE_GEOCODE", "Re-geocode on update", "set SHOULD_RE_GEOCODE=1 to re-geocode when overriding"),
    ("SHOULD_GEOCODE", "Geocoding", "set SHOULD_GEOCODE=1 to enable geocoding"),
]


def _log_feature_status(env_var: str, label: str, *, disabled_hint: str | None = None) -> None:
    if is_truthy_env(env_var):
        _log(f"{label}: enabled ({env_var})")
    else:
        hint = disabled_hint or f"set {env_var}=1 to enable"
        _log(f"{label}: disabled ({hint})")


def _log_tagging_status(env_var: str, label: str, retag_env_var: str) -> None:
    if is_truthy_env(env_var):
        if is_truthy_env(retag_env_var):
            _log(f"{label}: enabled, retagging existing jobs ({env_var}=1, {retag_env_var}=1)")
        else:
            _log(f"{label}: enabled for new/untagged jobs only ({env_var}=1)")
    else:
        _log(f"{label}: disabled (set {env_var}=1 to enable)")


def _log_environment_status() -> None:
    for item in _SIMPLE_FEATURE_FLAGS:
        env_var, label, *rest = item
        _log_feature_status(env_var, label, disabled_hint=rest[0] if rest else None)

    _log_tagging_status("SHOULD_TAG_SKILLS", "Skills tagging", "SHOULD_RE_TAG_SKILLS")
    _log_tagging_status("SHOULD_TAG_VALUES", "Values tagging", "SHOULD_RE_TAG_VALUES")


# ---- Data fetching ----

def get_all_sources():
    """Fetch all sources from the Supabase sources table."""
    response = supabase.table("sources").select("*").execute()
    if not response.data:
        raise Exception(f"Error fetching sources: {response.response}")
    return response.data


def get_existing_jobs() -> set[str]:
    """Fetch existing job listing URLs for duplicate checking.

    Paginates through all rows so no jobs are missed.
    Both the original URL and its trailing-slash variant are included
    so the in-memory check catches either form.
    """
    urls: set[str] = set()
    try:
        rows = fetch_all_rows("jobs", "listing_url")
        for job in rows:
            add_url_dedup_variants(job.get("listing_url"), urls)
    except Exception as e:
        _log(f"Error fetching existing jobs: {e}")
    return urls


# ---- Dry-run helpers ----

def _collect_field_gaps(jobs: list[dict]) -> dict[str, int]:
    gaps: dict[str, int] = {f: 0 for f in CHECKED_FIELDS}
    for job in jobs:
        for f in CHECKED_FIELDS:
            if not job.get(f):
                gaps[f] += 1
    return {f: n for f, n in gaps.items() if n > 0}


def _log_job_row(index: int, job: dict, status: str = "", missing: list[str] | None = None) -> None:
    title = job.get("job_title", "?")
    org = job.get("organization", "?")
    loc = job.get("location", "?")
    wage = job.get("wage", "N/A")
    date = job.get("date_posted", "?")
    url = job.get("listing_url", "")
    flag = f"  MISSING: {', '.join(missing)}" if missing else ""
    prefix = f"[{status}] " if status else ""
    _log(f"  {index + 1}. {prefix}{title}")
    _log(f"     org={org} | loc={loc} | wage={wage} | date={date}")
    _log(f"     {url}{flag}")


def _fetch_db_jobs_for_source(source_id: str) -> dict[str, dict]:
    """Fetch existing DB jobs for a source, keyed by normalized URL."""
    db_jobs: dict[str, dict] = {}
    try:
        resp = supabase.table("jobs").select(
            "listing_url, job_title, organization, location, wage, date_posted, employment_type"
        ).eq("source_id", source_id).execute()
        for row in (resp.data or []):
            url = normalize_listing_url(row.get("listing_url"))
            if url:
                db_jobs[url] = row
    except Exception as e:
        _log(f"  (could not fetch existing jobs for comparison: {e})")
    return db_jobs


def _compare_job_fields(job: dict, db_row: dict) -> dict[str, dict]:
    """Return a dict of field-level diffs between a scraped job and its DB row.

    Only includes fields where both sides are non-empty and differ.
    """
    diffs: dict[str, dict] = {}
    for f in COMPARE_FIELDS:
        old = (db_row.get(f) or "").strip() if isinstance(db_row.get(f), str) else db_row.get(f)
        new_val = (job.get(f) or "").strip() if isinstance(job.get(f), str) else job.get(f)
        if old and new_val and old != new_val:
            diffs[f] = {"db": old, "scraped": new_val}
    return diffs


def _log_compare_results(
    jobs: list[dict],
    new_count: int,
    existing_count: int,
    removed: list[dict],
    gaps: dict[str, int],
) -> None:
    _log(f"  ---")
    _log(f"  {new_count} new, {existing_count} existing, {len(removed)} no longer on site")
    if removed:
        for row in removed[:10]:
            _log(f"    gone: {row.get('job_title', '?')} ({row.get('listing_url', '')})")
        if len(removed) > 10:
            _log(f"    ... and {len(removed) - 10} more")
    if gaps:
        _log(f"  Field gaps: {gaps}")
    else:
        _log(f"  All fields populated for all {len(jobs)} jobs")


def _run_compare_only_dry_run(jobs: list[dict], source: dict) -> dict:
    """Compare scraped jobs to DB for this source. Log diffs and return summary dict."""
    db_jobs = _fetch_db_jobs_for_source(source["id"])

    field_changes: dict[str, int] = {f: 0 for f in COMPARE_FIELDS}
    scraped_urls: set[str] = set()
    new_count = 0
    existing_count = 0
    job_diffs: dict[str, dict] = {}

    for i, job in enumerate(jobs):
        norm_url = normalize_listing_url(job.get("listing_url", ""))
        scraped_urls.add(norm_url)
        is_new = norm_url not in db_jobs
        new_count += is_new
        existing_count += not is_new
        missing = [f for f in CHECKED_FIELDS if not job.get(f)]
        _log_job_row(i, job, status="NEW" if is_new else "existing", missing=missing)

        if not is_new:
            field_diffs = _compare_job_fields(job, db_jobs[norm_url])
            for f, diff in field_diffs.items():
                field_changes[f] += 1
                job_diffs.setdefault(
                    norm_url,
                    {"title": job.get("job_title", "?"), "url": job.get("listing_url", ""), "field_diffs": {}},
                )["field_diffs"][f] = diff

    removed = [row for u, row in db_jobs.items() if u not in scraped_urls]
    gaps = _collect_field_gaps(jobs)
    _log_compare_results(jobs, new_count, existing_count, removed, gaps)

    return {
        "source": source["name"],
        "jobs_found": len(jobs),
        "new": new_count,
        "existing": existing_count,
        "removed": len(removed),
        "field_gaps": gaps,
        "field_changes": field_changes,
        "job_diffs": list(job_diffs.values()),
    }


def _run_simple_dry_run(jobs: list[dict], source: dict) -> dict:
    """Log jobs and field gaps for simple dry-run (no DB comparison). Return summary dict."""
    for i, job in enumerate(jobs):
        missing = [f for f in CHECKED_FIELDS if not job.get(f)]
        _log_job_row(i, job, missing=missing)

    gaps = _collect_field_gaps(jobs)
    if gaps:
        _log(f"  Field gaps: {gaps}")
    else:
        _log(f"  All fields populated for all {len(jobs)} jobs")

    return {
        "source": source["name"],
        "jobs_found": len(jobs),
        "new": 0,
        "existing": len(jobs),
        "removed": 0,
        "field_gaps": gaps,
        "field_changes": {},
    }


# ---- Job processing ----

def _process_jobs_for_source(jobs: list[dict], source: dict, existing_urls: set[str]) -> dict:
    """Process jobs for one source: dry-run (compare or simple) or save to DB. Returns summary dict."""
    if DRY_RUN:
        return _run_compare_only_dry_run(jobs, source) if COMPARE_ONLY else _run_simple_dry_run(jobs, source)

    results = []
    job_ids = []
    for job in jobs:
        try:
            result, job_id = save_job(job, source["id"])
            results.append(result)
            if result not in ["skipped", "error"]:
                add_url_dedup_variants(job.get("listing_url"), existing_urls)
                if job_id:
                    job_ids.append(job_id)
        except Exception as e:
            _log(f"Error saving job (skipped): {e}")
            results.append("error")

    added_count = sum(1 for r in results if r == "added")
    updated_count = sum(1 for r in results if r == "updated")
    log_scrape_run(source["id"], len(jobs), added_count)
    return {
        "source": source["name"],
        "jobs_found": len(jobs),
        "jobs_added": added_count,
        "jobs_updated": updated_count,
        "job_ids": job_ids,
    }


# ---- Post-scrape tasks ----

def _run_unified_processor(job_ids: list[str]) -> None:
    """Run unified LLM post-processing (classify/values/summarize) for the given job IDs."""
    if not any([
        is_truthy_env("SHOULD_CLASSIFY"),
        is_truthy_env("SHOULD_TAG_VALUES"),
        is_truthy_env("SHOULD_SUMMARIZE"),
    ]):
        return

    _log("\nRunning unified post-processing...")
    try:
        from scripts.unified_post_processor import process_jobs_unified

        tasks = []
        if is_truthy_env("SHOULD_CLASSIFY"):
            tasks.append("sse")
        if is_truthy_env("SHOULD_TAG_VALUES"):
            tasks.append("values")
        if is_truthy_env("SHOULD_SUMMARIZE"):
            tasks.append("summary")

        task = "all" if len(tasks) > 1 else tasks[0]
        result = process_jobs_unified(task=task, job_ids=job_ids, dry_run=False, verbose=True)

        _log(f"Unified processing complete: {result['processed']} jobs processed")
        _log(f"  Provider used: {result['provider_used']}")
        if result['updated']['sse'] > 0:
            _log(f"  SSE classifications: {result['updated']['sse']}")
        if result['updated']['values'] > 0:
            _log(f"  Values tagged: {result['updated']['values']}")
        if result['updated']['summary'] > 0:
            _log(f"  Summaries: {result['updated']['summary']}")
    except Exception as e:
        _log(f"Error during unified processing: {e}")


def _run_esco_skill_tagging(job_ids: list[str]) -> None:
    """Run ESCO vector skill tagging for the given job IDs."""
    retag = is_truthy_env("SHOULD_RE_TAG_SKILLS")
    _log("\nRunning ESCO vector skill tagging...")
    try:
        from scripts.tag_esco_skills_vector import tag_esco_skills_vector
        result = tag_esco_skills_vector(job_ids=job_ids, retag=retag, dry_run=False)
        _log(f"ESCO vector skill tagging complete: {result['processed']} jobs tagged, {result['inserted']} skills inserted")
        if result['zero_match_jobs'] > 0:
            _log(f"  Jobs with 0 matches: {result['zero_match_jobs']}")
        if result['errors'] > 0:
            _log(f"  Errors: {result['errors']}")
    except Exception as e:
        _log(f"Error during ESCO vector skill tagging: {e}")


def _run_post_scrape_tasks(summary: list[dict]) -> None:
    """Run unified post-processing with a single LLM call per batch."""
    all_job_ids = [
        str(job_id)
        for s in summary
        for job_id in s.get("job_ids", [])
        if job_id is not None
    ]

    if not all_job_ids:
        _log("No job IDs found for unified processing")
        return

    _run_unified_processor(all_job_ids)

    if is_truthy_env("SHOULD_TAG_SKILLS"):
        _run_esco_skill_tagging(all_job_ids)


# ---- Summary printing ----

def _format_summary_line(s: dict) -> str:
    parts = []
    if DRY_RUN:
        if COMPARE_ONLY:
            parts.append(f"{s.get('new', 0)} new, {s.get('existing', 0)} existing, {s.get('removed', 0)} gone")
            change_str = ", ".join(f"{f} changed on {n}" for f, n in (s.get("field_changes") or {}).items() if n)
            if change_str:
                parts.append(change_str)
        else:
            parts.append("(not saved)")
        gap_str = ", ".join(f"{f} missing on {n}" for f, n in (s.get("field_gaps") or {}).items())
        if gap_str:
            parts.append(gap_str)
    else:
        if s.get("jobs_added"):
            parts.append(f"Added {s['jobs_added']}")
        if s.get("jobs_updated"):
            parts.append(f"Updated {s['jobs_updated']}")
        if not s.get("jobs_added") and not s.get("jobs_updated") and s.get("jobs_found"):
            parts.append("0 new (all already existed or skipped)")
    return ", ".join(parts) or "0 jobs found"


def _print_scrape_summary(summary: list[dict]) -> None:
    header_suffix = ""
    if DRY_RUN:
        header_suffix = " (DRY RUN, COMPARE ONLY)" if COMPARE_ONLY else " (DRY RUN)"

    _log("\nScrape Summary:" + header_suffix)
    for s in summary:
        if s.get("error"):
            _log(f"- {s['source']}: ❌ Failed - {s['error']}")
            continue
        _log(f"- {s['source']}: {_format_summary_line(s)}")

        if DRY_RUN and COMPARE_ONLY:
            for diff in (s.get("job_diffs") or []):
                title = diff.get("title") or "Unknown"
                url = diff.get("url") or ""
                _log(f"  DIFF: {title}")
                if url:
                    _log(f"    URL: {url}")
                for fname, vals in (diff.get("field_diffs") or {}).items():
                    _log(f"    {fname}: DB={vals.get('db')} -> SCRAPED={vals.get('scraped')}")


# ---- Per-source scraping ----

def _scrape_source(scraper, source: dict, existing_urls: set[str]) -> dict:
    """Fetch jobs from scraper, log results, process and return summary entry."""
    _log("#######################")
    _log(f"# Fetching jobs for {source['name']}... #")
    _log("#######################")
    jobs = scraper.fetch_jobs()

    _log(f"Found {len(jobs)} jobs")
    if scraper.total_listings_found > 0:
        _log(f"Total listings found: {scraper.total_listings_found}")
        if scraper.skipped_duplicates > 0:
            new_count = scraper.total_listings_found - scraper.skipped_duplicates
            _log(f"Skipped {scraper.skipped_duplicates} duplicates (already in database)")
            _log(f"New jobs to process: {new_count}")
    elif len(jobs) == 0:
        _log("No job listings found on the site")

    if jobs:
        _log(f"Job keys: {list(jobs[0].keys())}")

    _log("--------------------------------")
    if DRY_RUN:
        _log(f"DRY RUN: skipping DB save for {len(jobs)} jobs")

    return _process_jobs_for_source(jobs, source, existing_urls)


def _capture_and_upload_error_screenshot(scraper, source_name: str | None) -> None:
    """Capture screenshot from scraper (if any), upload to Supabase. Never raises."""
    if scraper is None:
        return
    page = getattr(scraper, "listings_page", None) or getattr(scraper, "page", None)
    if not page:
        return
    from utils.storage import capture_and_upload_error_screenshot
    name = source_name or (getattr(scraper, "source", None) or {}).get("name") or "scraper"
    capture_and_upload_error_screenshot(page, supabase, get_supabase_url(), name)


# ---- Main ----

def _close_scraper(scraper) -> None:
    """Close the scraper browser. Never raises."""
    if scraper:
        try:
            scraper.close_browser()
        except Exception:
            pass


def _handle_source_error(e: Exception, scraper, source_name: str | None, summary: list[dict]) -> None:
    """Log a per-source scrape error, capture a screenshot, and append a failure entry to summary."""
    err_str = str(e)
    is_blocked = "403" in err_str or "forbidden" in err_str.lower() or "blocked" in err_str.lower()
    if is_blocked:
        _log(f"\n⛔ {source_name} is blocking this IP (403 Forbidden) - skipping")
        error_msg = "403 Forbidden - IP blocked"
    else:
        _log(f"\n❌ Scraper error for {source_name}")
        _log(f"Exception type: {type(e).__name__}")
        _log(f"Message: {e}")
        traceback.print_exc()
        error_msg = err_str

    _capture_and_upload_error_screenshot(scraper, source_name)
    summary.append({"source": source_name, "error": error_msg, "jobs_added": 0, "jobs_found": 0})


def main():
    _args = parse_args()

    if _args.use_prod:
        _confirm_prod_run()
        os.environ["USE_PROD_DB"] = "1"

    print("scrape.py: loading...", flush=True)

    current_scraper = None
    current_source_name = None
    summary = []

    try:
        _log_environment_status()

        _log("Fetching sources from Supabase...")
        sources = get_all_sources()
        _log(f"Found {len(sources)} source(s).")

        _log("Fetching existing jobs for duplicate checking...")
        existing_urls = get_existing_jobs()
        _log(f"Found {len(existing_urls)} existing URLs in database")

        for source in sources:
            scraper_class = SCRAPER_MAP.get(source["id"])
            if not scraper_class:
                _log(f"No scraper defined for {source['name']}")
                continue

            current_scraper = scraper_class(source)
            current_scraper.existing_urls = existing_urls
            current_source_name = source.get("name")

            try:
                summary.append(_scrape_source(current_scraper, source, existing_urls))
            except Exception as e:
                _handle_source_error(e, current_scraper, current_source_name, summary)
            finally:
                _close_scraper(current_scraper)
                current_scraper = None
                current_source_name = None

        _run_post_scrape_tasks(summary)
        _print_scrape_summary(summary)
        sys.exit(0)

    except Exception as e:
        _log(f"\n❌ Scraper error")
        _log(f"Exception type: {type(e).__name__}")
        _log(f"Message: {e}")
        _log("Stack trace:")
        traceback.print_exc()
        _capture_and_upload_error_screenshot(current_scraper, current_source_name)
        _close_scraper(current_scraper)
        sys.exit(1)


if __name__ == "__main__":
    _log("Scraper starting...")
    main()
