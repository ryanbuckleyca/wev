import os
import sys
import traceback
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Set

from settings import ensure_env_loaded, load_env_file
from utils.prod_env import apply_prod_overrides, confirm_prod_run, resolve_prod_env_path

# Ensure CI sees output immediately
if hasattr(sys.stdout, "reconfigure"):
    import io
    if isinstance(sys.stdout, io.TextIOWrapper):
        sys.stdout.reconfigure(line_buffering=True)

# Note: Import database and scraper classes AFTER environment might have been modified by CLI args
from scrapers.registry import get_scraper_class, source_matches_slug
from utils.db import fetch_all_rows, get_supabase_url, log_scrape_run, save_job, supabase
from utils.env import is_truthy_env
from utils.log import scraper_log as _log
from utils.url import add_url_dedup_variants, normalize_listing_url

os.environ['PLAYWRIGHT_SYNC_MODE'] = '1'

# Constants for reporting
COMPARE_FIELDS = ["job_title", "organization", "location", "wage", "employment_type", "date_posted"]


def list_sources() -> None:
    """List sources from the active Supabase project (respects --staging / --prod / --publish)."""
    _log(f"Listing sources from {get_supabase_url()}")
    response = supabase.table("sources").select("name,slug").order("slug").execute()
    if not response.data:
        print("No sources found.")
        return
    print("Available source slugs:")
    for s in response.data:
        slug = s.get("slug")
        name = s.get("name", "Unknown Source")
        if slug:
            print(f"  - {slug} ({name})")
        else:
            print(f"  - <missing slug> ({name})")


@dataclass
class ScraperResults:
    """Aggregated results of a scraping session."""
    summary: List[Dict[str, Any]] = field(default_factory=list)
    all_job_ids: List[str] = field(default_factory=list)
    is_dry_run: bool = False
    is_compare_only: bool = False


class ScraperOrchestrator:
    """Manages the lifecycle of a scraping session."""

    def __init__(self, dry_run: bool = False, compare_only: bool = False, source_slug: str | None = None):
        self.dry_run = dry_run
        self.compare_only = compare_only
        self.source_slug = source_slug.strip() if source_slug else None
        self.results = ScraperResults(is_dry_run=dry_run, is_compare_only=compare_only)
        self.existing_urls: Set[str] = set()
        self.source_attempts: Dict[str, int] = {}
        self.post_scrape_errors = 0

    def had_failures(self) -> bool:
        """True when any source scrape or post-scrape step failed."""
        if self.post_scrape_errors > 0:
            return True
        return any("error" in entry for entry in self.results.summary)

    def run(self):
        """Execute the full scraping lifecycle."""
        try:
            self._log_environment_status()

            # 1. Setup
            sources = self._fetch_sources()
            self.existing_urls = self._fetch_existing_job_urls()

            # 2. Main Loop
            queue = sources.copy()
            while queue:
                source = queue.pop(0)
                retry_requested = self._process_single_source(source)
                if retry_requested:
                    queue.append(source)
                    _log(f"🔄 Re-queued {source.get('name')} to the end.")

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
        sources = response.data
        if self.source_slug == "charityvillage":
            sources.append({"id": "mock-charityvillage", "name": "Charity Village", "slug": "charityvillage"})
        if self.source_slug:
            sources = [
                s for s in sources if source_matches_slug(s, self.source_slug)
            ]
            if not sources:
                raise RuntimeError(
                    f"No source found with slug '{self.source_slug}'. "
                    "Use npm run scrape:list-sources to see available slugs."
                )
            if len(sources) > 1:
                slugs = ", ".join(s.get("slug", "?") for s in sources)
                raise RuntimeError(
                    f"Multiple sources match slug '{self.source_slug}': {slugs}"
                )
        _log(f"Found {len(sources)} source(s).")
        return sources

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

    _TRANSIENT_ERROR_SIGNALS = (
        "err_connection_closed",
        "err_timed_out",
        "err_connection_reset",
        "err_connection_refused",
        "err_name_not_resolved",
        "net::err_",
        "timeout",
        "connection reset",
        "connection closed",
        "read timeout",
        "ssl",
        "eof occurred",
    )

    @classmethod
    def _is_transient_error(cls, e: Exception) -> bool:
        msg = str(e).lower()
        # Never retry explicit blocks — they'll just fail again
        if "403" in msg or "forbidden" in msg or "ip blocked" in msg:
            return False
        return any(signal in msg for signal in cls._TRANSIENT_ERROR_SIGNALS)

    def _process_single_source(self, source: Dict[str, Any], max_source_retries: int = 2) -> bool:
        source_name = source.get("name", "Unknown Source")
        scraper_class = get_scraper_class(source)

        if not scraper_class:
            _log(f"Skipping {source_name}: No scraper implementation registered.")
            return False

        source_id = source["id"]
        attempt = self.source_attempts.get(source_id, 0) + 1
        self.source_attempts[source_id] = attempt

        _log(f"\n{'#' * 30}\n# {source_name} (Attempt {attempt}/{max_source_retries + 1})\n{'#' * 30}")

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

            return False  # success — no retry needed

        except Exception as e:
            is_last_attempt = attempt > max_source_retries
            if not is_last_attempt and self._is_transient_error(e):
                _log(f"⚠️  Transient error on {source_name}: {e}")
                return True  # request re-queue
            self._handle_source_error(e, scraper, source_name)
            return False
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
                from scripts.unified_post_processor import ProcessingOptions, process_jobs_unified
                result = process_jobs_unified(ProcessingOptions(job_ids=self.results.all_job_ids))
                self.post_scrape_errors = result.get("errors", 0)
                if self.post_scrape_errors:
                    _log(
                        f"❌ Unified post-processing finished with "
                        f"{self.post_scrape_errors} error(s)"
                    )
            except Exception as e:
                _log(f"❌ Error in unified post-processing: {e}")
                self.post_scrape_errors += 1

        # ESCO Skill Tagging
        if is_truthy_env("SHOULD_TAG_SKILLS"):
            try:
                from scripts.tag_esco_skills_vector import tag_esco_skills_vector
                tag_esco_skills_vector(job_ids=self.results.all_job_ids)
            except Exception as e:
                _log(f"❌ Error in ESCO tagging: {e}")
                self.post_scrape_errors += 1

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
        if not scraper:
            return
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


def resolve_scrape_env(args) -> str:
    """Resolve target env from --env or legacy flags."""
    legacy: list[str] = []
    if args.staging:
        legacy.append("staging")
    if args.prod:
        legacy.append("prod")
    if args.publish:
        legacy.append("publish")
    if len(legacy) > 1:
        print("Error: only one of --staging, --prod, --publish may be set.", file=sys.stderr)
        sys.exit(2)
    if legacy:
        return legacy[0]
    return args.env


def parse_args():
    import argparse
    parser = argparse.ArgumentParser(
        description="WEV Scraper Orchestrator",
        epilog=(
            "npm aliases: scrape:local, scrape:staging, scrape:prod, scrape:publish\n"
            "(each runs: npm run scrape -- --env <name>)\n"
            "List slugs:  npm run scrape:list-sources\n"
            "One source:  npm run scrape:prod -- --source mac"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--env",
        choices=["local", "staging", "prod", "publish"],
        default="local",
        help="Target environment (default: local)",
    )
    parser.add_argument(
        "--prod",
        action="store_true",
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        "--publish",
        action="store_true",
        help=argparse.SUPPRESS,
    )
    parser.add_argument("--staging", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--dry-run", "--dry", action="store_true", help="Skip database writes")
    parser.add_argument("--compare", action="store_true", help="Dry run + compare with DB")
    parser.add_argument("--provider", help="Force specific LLM provider")
    parser.add_argument("--max-jobs", type=int, help="Limit jobs per source")
    parser.add_argument("--headed", action="store_true", help="Show browser window (for debugging)")
    parser.add_argument("--vpn", action="store_true", help="Enable VPN-specific scraper behavior")
    parser.add_argument(
        "--slug",
        "--source",
        dest="slug",
        metavar="SLUG",
        help="Only run the scraper for this source slug (e.g. mac, goodwork)",
    )
    parser.add_argument(
        "--list-sources",
        action="store_true",
        help="List source slugs via Supabase (slow — prefer: npm run scrape:list-sources)",
    )
    return parser.parse_args()


def initialize_runtime_env(env: str):
    """Predictable environment initialization based on --env target."""
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent

    base_env = root_dir / ".env" if (root_dir / ".env").exists() else script_dir / ".env"
    if base_env.exists():
        load_env_file(base_env)

    if env == "staging":
        staging_env = root_dir / ".env.staging" if (root_dir / ".env.staging").exists() else script_dir / ".env.staging"
        if staging_env.exists():
            _log(f"▶ Loading Staging Overrides from {staging_env.name}")
            load_env_file(staging_env)
        else:
            _log(f"⚠️ Warning: --env staging but {staging_env} not found.")

    if env in ("prod", "publish"):
        prod_env = resolve_prod_env_path(script_dir / "scrape.py")
        if not prod_env.exists():
            _log(f"❌ {prod_env} not found — required for --env prod / publish.")
            sys.exit(1)
        apply_prod_overrides(prod_env, full_prod=(env == "prod"))


def main():
    args = parse_args()
    env = resolve_scrape_env(args)

    initialize_runtime_env(env)

    # 2. Environment Overrides from CLI
    if args.provider:
        os.environ["LLM_PROVIDER"] = args.provider
    if args.max_jobs:
        os.environ["MAX_JOBS_PER_SOURCE"] = str(args.max_jobs)
    if args.headed:
        os.environ["SCRAPER_HEADED"] = "1"
    if args.vpn:
        os.environ["SCRAPER_VPN_MODE"] = "1"
    if args.dry_run or args.compare:
        os.environ["DRY_RUN"] = "1"
        # Disable LLM expensive steps in dry run by default
        for flag in ["SHOULD_SUMMARIZE", "SHOULD_CLASSIFY", "SHOULD_TAG_VALUES", "SHOULD_TAG_SKILLS"]:
            if os.environ.get(flag) is None:
                os.environ[flag] = "0"

    if args.list_sources:
        list_sources()
        sys.exit(0)

    if env in ("prod", "publish"):
        os.environ["USE_PROD_DB"] = "1"
        confirm_prod_run(full_prod=(env == "prod"))

    # 3. Orchestrate
    orchestrator = ScraperOrchestrator(
        dry_run=args.dry_run or args.compare,
        compare_only=args.compare,
        source_slug=args.slug,
    )
    orchestrator.run()

    if orchestrator.had_failures():
        sys.exit(1)


if __name__ == "__main__":
    main()
