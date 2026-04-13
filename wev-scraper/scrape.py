import sys
import os
import traceback
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Set, Any, Optional
from settings import ensure_env_loaded, load_env_file

# Ensure CI sees output immediately
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

# Note: Import database and scraper classes AFTER environment might have been modified by CLI args
from utils.db import save_job, log_scrape_run, supabase, get_supabase_url, fetch_all_rows
from utils.env import is_truthy_env
from utils.log import scraper_log as _log
from utils.url import add_url_dedup_variants, normalize_listing_url
from scrapers.registry import get_scraper_class

os.environ['PLAYWRIGHT_SYNC_MODE'] = '1'

# Constants for reporting
CHECKED_FIELDS = [
    "job_title", "organization", "location", "date_posted",
    "wage", "description", "employment_type", "listing_url",
]
COMPARE_FIELDS = ["job_title", "organization", "location", "wage", "employment_type", "date_posted"]


@dataclass
class ScraperResults:
    """Aggregated results of a scraping session."""
    summary: List[Dict[str, Any]] = field(default_factory=list)
    all_job_ids: List[str] = field(default_factory=list)
    is_dry_run: bool = False
    is_compare_only: bool = False


class ScraperOrchestrator:
    """Manages the lifecycle of a scraping session."""

    def __init__(self, use_prod: bool = False, dry_run: bool = False, compare_only: bool = False):
        self.use_prod = use_prod
        self.dry_run = dry_run
        self.compare_only = compare_only
        self.results = ScraperResults(is_dry_run=dry_run, is_compare_only=compare_only)
        self.existing_urls: Set[str] = set()

    def run(self):
        """Execute the full scraping lifecycle."""
        try:
            self._log_environment_status()

            # 1. Setup
            sources = self._fetch_sources()
            self.existing_urls = self._fetch_existing_job_urls()

            # 2. Main Loop
            for source in sources:
                self._process_single_source(source)

            # 3. Post-Processing
            if self.results.all_job_ids:
                self._run_post_scrape_tasks()

            # 4. Reporting
            self._print_final_summary()

        except Exception as e:
            self._handle_fatal_error(e)

    def _log_environment_status(self):
        _log("--- Environment Status ---")
        self._log_feature_status("SHOULD_OVERRIDE_EXISTING", "Overriding existing entries")
        self._log_tagging_status("SHOULD_TAG_SKILLS", "Skills tagging", "SHOULD_RE_TAG_SKILLS")
        self._log_tagging_status("SHOULD_TAG_VALUES", "Values tagging", "SHOULD_RE_TAG_VALUES")
        if self.dry_run:
            mode = " (COMPARE ONLY)" if self.compare_only else ""
            _log(f"MODE: DRY RUN{mode}")

    def _log_feature_status(self, env_var: str, label: str):
        status = "enabled" if is_truthy_env(env_var) else "disabled"
        _log(f"{label}: {status}")

    def _log_tagging_status(self, env_var: str, label: str, retag_env_var: str):
        if is_truthy_env(env_var):
            suffix = ", retagging existing" if is_truthy_env(retag_env_var) else ""
            _log(f"{label}: enabled{suffix}")
        else:
            _log(f"{label}: disabled")

    def _fetch_sources(self) -> List[Dict[str, Any]]:
        _log("Fetching sources from Supabase...")
        response = supabase.table("sources").select("*").execute()
        if not response.data:
            raise RuntimeError(f"Could not fetch sources: {response}")
        _log(f"Found {len(response.data)} source(s).")
        return response.data

    def _fetch_existing_job_urls(self) -> Set[str]:
        _log("Fetching existing jobs for duplicate checking...")
        urls: Set[str] = set()
        try:
            rows = fetch_all_rows("jobs", "listing_url")
            for job in rows:
                add_url_dedup_variants(job.get("listing_url"), urls)
            _log(f"Found {len(urls)} existing URLs in database.")
        except Exception as e:
            _log(f"Warning: Error fetching existing jobs: {e}")
        return urls

    def _process_single_source(self, source: Dict[str, Any]):
        source_name = source.get("name", "Unknown Source")
        scraper_class = get_scraper_class(source["id"])

        if not scraper_class:
            _log(f"Skipping {source_name}: No scraper implementation registered.")
            return

        _log(f"\n{'#' * 30}\n# {source_name}\n{'#' * 30}")

        scraper = None
        try:
            scraper = scraper_class(source)
            scraper.existing_urls = self.existing_urls

            jobs = scraper.fetch_jobs()
            _log(f"Found {len(jobs)} jobs.")

            source_summary = self._save_or_compare_jobs(jobs, source)
            self.results.summary.append(source_summary)

            if "job_ids" in source_summary:
                self.results.all_job_ids.extend(source_summary["job_ids"])

        except Exception as e:
            self._handle_source_error(e, scraper, source_name)
        finally:
            self._cleanup_scraper(scraper)

    def _save_or_compare_jobs(self, jobs: List[Dict[str, Any]], source: Dict[str, Any]) -> Dict[str, Any]:
        if self.dry_run:
            if self.compare_only:
                return self._run_compare_dry_run(jobs, source)
            return self._run_simple_dry_run(jobs, source)

        results = []
        job_ids = []
        for job in jobs:
            try:
                result, job_id = save_job(job, source["id"])
                results.append(result)
                if result not in ["skipped", "error"]:
                    add_url_dedup_variants(job.get("listing_url"), self.existing_urls)
                    if job_id:
                        job_ids.append(job_id)
            except Exception as e:
                _log(f"  Error saving job: {e}")
                results.append("error")

        added = sum(1 for r in results if r == "added")
        updated = sum(1 for r in results if r == "updated")
        log_scrape_run(source["id"], len(jobs), added)

        return {
            "source": source["name"],
            "jobs_found": len(jobs),
            "jobs_added": added,
            "jobs_updated": updated,
            "job_ids": job_ids,
        }

    def _run_simple_dry_run(self, jobs: List[Dict[str, Any]], source: Dict[str, Any]) -> Dict[str, Any]:
        for i, job in enumerate(jobs):
            self._log_job_minimal(i, job)
        return {"source": source["name"], "jobs_found": len(jobs), "status": "dry-run"}

    def _run_compare_dry_run(self, jobs: List[Dict[str, Any]], source: Dict[str, Any]) -> Dict[str, Any]:
        # Logic for comparing against DB
        _log("Comparing scraped data with database...")
        db_jobs = self._fetch_db_jobs_for_source(source["id"])

        new_count = 0
        job_diffs = []
        for i, job in enumerate(jobs):
            norm_url = normalize_listing_url(job.get("listing_url", ""))
            is_new = norm_url not in db_jobs
            new_count += is_new
            self._log_job_minimal(i, job, "NEW" if is_new else "EXISTING")

            if not is_new:
                diffs = self._compare_fields(job, db_jobs[norm_url])
                if diffs:
                    job_diffs.append({"title": job.get("job_title"), "diffs": diffs})

        return {
            "source": source["name"],
            "jobs_found": len(jobs),
            "new": new_count,
            "diffs": job_diffs,
            "status": "compare-only"
        }

    def _log_job_minimal(self, index: int, job: Dict[str, Any], prefix: str = ""):
        title = job.get("job_title", "?")
        org = job.get("organization", "?")
        status = f"[{prefix}] " if prefix else ""
        _log(f"  {index+1}. {status}{title} | {org}")

    def _fetch_db_jobs_for_source(self, source_id: str) -> Dict[str, Dict]:
        try:
            resp = supabase.table("jobs").select(",".join(COMPARE_FIELDS + ["listing_url"])).eq("source_id", source_id).execute()
            return {normalize_listing_url(r["listing_url"]): r for r in (resp.data or []) if r.get("listing_url")}
        except Exception as e:
            _log(f"  Warning: Could not fetch DB jobs for comparison: {e}")
            return {}

    def _compare_fields(self, job: Dict[str, Any], db_row: Dict[str, Any]) -> Dict[str, Dict]:
        diffs = {}
        for f in COMPARE_FIELDS:
            scraped = str(job.get(f, "")).strip()
            stored = str(db_row.get(f, "")).strip()
            if scraped and stored and scraped != stored:
                diffs[f] = {"stored": stored, "scraped": scraped}
        return diffs

    def _run_post_scrape_tasks(self):
        _log(f"\nRunning post-scrape tasks for {len(self.results.all_job_ids)} jobs...")

        # Unified Post-Processor (Classifier, Values, Summary)
        if any(is_truthy_env(f) for f in ["SHOULD_CLASSIFY", "SHOULD_TAG_VALUES", "SHOULD_SUMMARIZE"]):
            try:
                from scripts.unified_post_processor import process_jobs_unified
                process_jobs_unified(job_ids=self.results.all_job_ids)
            except Exception as e:
                _log(f"Error in unified post-processing: {e}")

        # ESCO Skill Tagging
        if is_truthy_env("SHOULD_TAG_SKILLS"):
            try:
                from scripts.tag_esco_skills_vector import tag_esco_skills_vector
                tag_esco_skills_vector(job_ids=self.results.all_job_ids)
            except Exception as e:
                _log(f"Error in ESCO tagging: {e}")

    def _print_final_summary(self):
        _log("\n" + "="*40)
        _log("FINAL SUMMARY")
        _log("="*40)
        for s in self.results.summary:
            source = s["source"]
            if "error" in s:
                _log(f"- {source}: ❌ FAILED ({s['error']})")
            elif self.dry_run or "jobs_added" not in s:
                _log(f"- {source}: Found {s.get('jobs_found', '?')} jobs (Dry Run)")
            else:
                _log(f"- {source}: Added {s['jobs_added']}, Updated {s['jobs_updated']}")

    def _handle_source_error(self, e: Exception, scraper, source_name: str):
        _log(f"❌ Error scraping {source_name}: {e}")
        traceback.print_exc()
        self.results.summary.append({"source": source_name, "error": str(e)})
        self._capture_error_screenshot(scraper, source_name)

    def _capture_error_screenshot(self, scraper, source_name: str):
        if not scraper: return
        page = getattr(scraper, "page", None) or getattr(scraper, "listings_page", None)
        if page:
            try:
                from utils.storage import capture_and_upload_error_screenshot
                capture_and_upload_error_screenshot(page, supabase, get_supabase_url(), source_name)
            except Exception as se:
                _log(f"  Warning: Could not capture screenshot: {se}")

    def _cleanup_scraper(self, scraper):
        if scraper:
            try:
                scraper.close_browser()
            except Exception as e:
                _log(f"⚠️ Warning: Failed to close browser cleanly: {e}")

    def _handle_fatal_error(self, e: Exception):
        _log(f"❌ FATAL ERROR: {e}")
        traceback.print_exc()
        sys.exit(1)


def parse_args():
    import argparse
    parser = argparse.ArgumentParser(description="WEV Scraper Orchestrator")
    parser.add_argument("--prod", action="store_true", help="Use production database")
    parser.add_argument("--staging", action="store_true", help="Use staging (.env.staging) environment")
    parser.add_argument("--dry-run", "--dry", action="store_true", help="Skip database writes")
    parser.add_argument("--compare", action="store_true", help="Dry run + compare with DB")
    parser.add_argument("--provider", help="Force specific LLM provider")
    parser.add_argument("--max-jobs", type=int, help="Limit jobs per source")
    parser.add_argument("--headed", action="store_true", help="Show browser window (for debugging)")
    return parser.parse_args()


def initialize_runtime_env(args):
    """Predictable environment initialization based on CLI flags."""
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent

    # 1. Load Baseline (.env) from root or local
    # This provides shared keys (Gemini, Geocodio, etc.)
    base_env = root_dir / ".env" if (root_dir / ".env").exists() else script_dir / ".env"
    if base_env.exists():
        ensure_env_loaded()

    # 2. Apply Staging Overrides if requested
    if args.staging:
        staging_env = root_dir / ".env.staging" if (root_dir / ".env.staging").exists() else script_dir / ".env.staging"
        if staging_env.exists():
            _log(f"▶ Loading Staging Overrides from {staging_env.name}")
            load_env_file(staging_env)
        else:
            _log(f"⚠️ Warning: --staging flag used but {staging_env} not found.")

    # 3. Apply Production Overrides if requested
    if args.prod:
        prod_env = root_dir / ".env.production" if (root_dir / ".env.production").exists() else script_dir / ".env.production"
        if prod_env.exists():
            _log(f"▶ Loading Production Overrides from {prod_env.name}")
            load_env_file(prod_env)


def main():
    import os
    args = parse_args()

    # 1. Confirm before doing anything else
    if args.prod and sys.stdin.isatty():
        sys.stdout.flush()
        confirm = input("⚠️  RUNNING AGAINST PRODUCTION. Type 'YES' to continue: ")
        if confirm != "YES":
            sys.exit(0)

    # 2. Initialize Environment
    initialize_runtime_env(args)

    # 3. Environment Overrides from CLI
    if args.provider:
        os.environ["LLM_PROVIDER"] = args.provider
    if args.max_jobs:
        os.environ["MAX_JOBS_PER_SOURCE"] = str(args.max_jobs)
    if args.headed:
        os.environ["SCRAPER_HEADED"] = "1"
    if args.dry_run or args.compare:
        os.environ["DRY_RUN"] = "1"
        # Disable LLM expensive steps in dry run by default
        for flag in ["SHOULD_SUMMARIZE", "SHOULD_CLASSIFY", "SHOULD_TAG_VALUES", "SHOULD_TAG_SKILLS"]:
            if os.environ.get(flag) is None:
                os.environ[flag] = "0"

    if args.prod:
        os.environ["USE_PROD_DB"] = "1"

    # 4. Orchestrate
    orchestrator = ScraperOrchestrator(
        use_prod=args.prod,
        dry_run=args.dry_run or args.compare,
        compare_only=args.compare
    )
    orchestrator.run()


if __name__ == "__main__":
    main()
