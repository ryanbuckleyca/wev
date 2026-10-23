"""Rescrape a single job URL and run the full post-processing pipeline on it.

Usage (from wev-scraper/):
    venv/bin/python -m scripts.rescrape_single_job \
        --url 'https://www.charityvillage.com/job/...' \
        [--source charityvillage] [--dry-run] [--headed]
"""
from __future__ import annotations

import argparse
import os
import sys

from settings import ensure_env_loaded

ensure_env_loaded()

from scrapers.registry import get_scraper_class  # noqa: E402
from utils.db import save_job, supabase  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="Rescrape a single job URL")
    parser.add_argument("--url", required=True, help="Full listing URL to rescrape")
    parser.add_argument("--source", default="charityvillage", help="Source slug (default: charityvillage)")
    parser.add_argument("--dry-run", action="store_true", help="Print result without writing to DB")
    parser.add_argument(
        "--headed",
        action="store_true",
        help="Run browser in headed (visible) mode. Default: headless unless SCRAPER_HEADED=1 in env",
    )
    args = parser.parse_args()

    # Headed mode: CLI --headed flag takes priority, fall back to SCRAPER_HEADED env
    if args.headed:
        os.environ["SCRAPER_HEADED"] = "1"

    # Look up source
    source_resp = supabase.table("sources").select("id, name, url, slug").eq("slug", args.source).limit(1).execute()
    if not source_resp.data:
        print(f"❌ Source '{args.source}' not found in DB", file=sys.stderr)
        sys.exit(1)
    source = source_resp.data[0]
    print(f"✓ Source: {source['name']}")

    # Resolve scraper class from the centralized registry (slug → prod UUID → name fallback chain)
    ScraperClass = get_scraper_class(source)
    if ScraperClass is None:
        from scrapers.registry import get_all_registered_source_slugs
        print(
            f"❌ No scraper registered for source '{source.get('slug') or source['name']}'. "
            f"Known slugs: {', '.join(get_all_registered_source_slugs())}",
            file=sys.stderr,
        )
        sys.exit(1)

    scraper = ScraperClass(source)
    # start_browser already respects SCRAPER_HEADED via _resolve_headless,
    # so we default to headless=True letting the env/flag override it.
    scraper.start_browser(headless=True, use_real_chrome=True, use_stealth=True)

    try:
        import time
        print(f"Opening: {args.url}")
        job_page, ok = scraper.safe_open_job_page(
            args.url,
            wait_selector=scraper.job_wait_selector,
            timeout=30000,
        )
        if not ok or not job_page:
            print("❌ Failed to open job page after retries", file=sys.stderr)
            sys.exit(1)

        time.sleep(2)  # let dynamic content settle

        # Diagnose what's actually on the page
        print("\n--- Page diagnostics ---")
        # Check all iframes
        frames = job_page.frames
        print(f"Frames: {len(frames)}")
        for i, f in enumerate(frames[1:], 1):
            print(f"  Frame {i}: {f.url[:100]}")
        # Check for embeds/objects/iframes in DOM
        for sel in ["iframe", "embed", "object", "[data-testid='job-detail-description']", "[class*='description']"]:
            count = 0
            try:
                count = job_page.locator(sel).count()
                if count:
                    txt = job_page.locator(sel).first.inner_text(timeout=2000).strip()
                    print(f"  {sel} ({count}): {repr(txt[:150])}")
            except Exception as e:
                print(f"  {sel} (count={count}): error — {e}")
        print("--- end diagnostics ---\n")

        desc = (scraper.extract_description(job_page, {}) or "").strip()
        title = (scraper.extract_job_title(job_page, {}) or "").strip()
        org = (scraper.extract_organization(job_page, {}) or "").strip()

        print(f"✓ Title:       {title}")
        print(f"✓ Org:         {org}")
        print(f"✓ Description: {len(desc)} chars")
        print(f"  Snippet:     {repr(desc[:300])}")

        if args.dry_run:
            job_page.close()
            print("\n[dry-run] Not writing to DB.")
            return

        # Build a minimal job dict for save_job
        fields = {
            "listing_url": args.url,
            "source_id": source["id"],
            "job_title": title,
            "organization": org,
            "description": desc,
            "location": scraper.extract_location(job_page, {}) or "",
            "employment_type": scraper.extract_employment_type(job_page, {}) or "",
            "date_posted": scraper.extract_date_posted(job_page, {}) or "",
            "close_date": scraper.extract_close_date(job_page, {}) or "",
            "wage": scraper.extract_wage(job_page, {}) or "",
        }
        job_page.close()

        # Enable override mode so save_job will update any existing row in-place
        # instead of skipping. This preserves the original row if save_job fails —
        # no unconditional delete-before-write that could cause data loss.
        os.environ["SHOULD_OVERRIDE_EXISTING"] = "1"

        result, job_id = save_job(fields, source["id"])
        if job_id:
            print(f"✓ Saved job ({result}): {job_id}")
        else:
            print(f"⚠ save_job returned no ID (result={result})")
            return

        # Run unified post-processor on the new job
        print("\nRunning unified post-processor...")
        from scripts.unified_post_processor import ProcessingOptions, process_jobs_unified
        result = process_jobs_unified(ProcessingOptions(
            task="all",
            job_ids=[job_id],
            page_limit=None,
            dry_run=False,
            verbose=True,
        ))
        print(f"Unified: processed={result['processed']}, errors={result['errors']}")

        # Run ESCO tagger
        print("\nRunning ESCO tagger...")
        from scripts.tag_esco_skills_vector import tag_esco_skills_vector
        esco = tag_esco_skills_vector(job_ids=[job_id])
        print(f"ESCO: processed={esco.get('processed')}, inserted={esco.get('inserted')}")

    finally:
        scraper.close_browser()


if __name__ == "__main__":
    main()
