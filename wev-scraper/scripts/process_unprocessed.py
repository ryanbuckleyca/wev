#!/usr/bin/env python3
"""Process all unprocessed orgs and jobs in prod DB."""
import argparse
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).resolve().parent
SCRAPER_DIR = SCRIPT_DIR.parent if SCRIPT_DIR.name == "scripts" else SCRIPT_DIR
REPO_ROOT = SCRAPER_DIR.parent
sys.path.insert(0, str(SCRAPER_DIR))

# ── Load dotenv files FIRST so they can't override mandatory prod settings ──
for env_file in [REPO_ROOT / ".env", REPO_ROOT / ".env.production"]:
    if env_file.exists():
        load_dotenv(env_file, override=True)

# ── Env setup: target PROD DB with confirmation bypass (set AFTER dotenv) ──
os.environ["USE_PROD_DB"] = "1"
os.environ["PROD_CONFIRMED"] = "1"
os.environ["CONFIRM_PROD_RUN"] = "YES"
os.environ["ENV_MODE"] = "prod"

from settings import get_supabase_settings  # noqa: E402
from utils.catch_up import (  # noqa: E402
    SKIP_REASON_EXCEPTION,
    VALID_LANGUAGES,
    _park_org,
    find_missing_org_fields,
    org_batch_limit,
    persist_org_assessment_outcome,
)
from utils.db import supabase  # noqa: E402
from utils.log import scraper_log as _log  # noqa: E402

config = get_supabase_settings()
_log(f"DB URL: {config.url}")


def fetch_unprocessed_jobs():
    """Fetch all jobs that lack summary/values/sse/language/skills OR organization_id."""
    _log("Fetching jobs from DB...")
    all_jobs = []
    page = 0
    page_size = 1000

    while True:
        resp = (
            supabase.table("jobs")
            .select(
                "id, listing_url, summary, values, is_sse, language, "
                "organization_id, skills, description, job_title, organization, scraped_at"
            )
            .order("scraped_at", desc=False)
            .range(page * page_size, (page + 1) * page_size - 1)
            .execute()
        )

        batch = resp.data or []
        all_jobs.extend(batch)

        if len(batch) < page_size:
            break

        page += 1

    unprocessed = []

    for j in all_jobs:
        needs = []

        if not (j.get("summary") or "").strip():
            needs.append("summary")

        if not j.get("values"):
            needs.append("values")

        if j.get("is_sse") is None:
            needs.append("sse")

        if j.get("language") not in VALID_LANGUAGES:
            needs.append("language")

        if not j.get("skills"):
            needs.append("skills")

        if j.get("organization_id") is None:
            needs.append("organization_id")

        if needs:
            unprocessed.append((j, needs))

    return all_jobs, unprocessed


def fetch_unprocessed_orgs(include_parked=False):
    """Fetch orgs missing sector_id/type/descriptions/language/values_list.

    Parked orgs (assessment_skip_reason set) are excluded unless *include_parked*,
    so a plain run never re-spends credits on rows a previous attempt gave up on.
    """
    _log("Fetching organizations from DB...")
    all_orgs = []
    page = 0
    page_size = 1000

    while True:
        try:
            resp = (
                supabase.table("organizations")
                .select("*")
                .order("id")
                .range(page * page_size, (page + 1) * page_size - 1)
                .execute()
            )
        except Exception as e:
            msg = str(e).lower()
            expected_failure = any(
                marker in msg
                for marker in ("column", "does not exist", "42703", "undefined")
            )

            if not expected_failure:
                raise

            resp = (
                supabase.table("organizations")
                .select(
                    "id,name,sector_id,type,description,description_en,"
                    "description_fr,website,location,is_sse,sse_rating,"
                    "mission_statement,values_list,values_rated,language,"
                    "municipality,province,lat,lng,geocode_accuracy_type,created_at,"
                    "updated_at,assessment_skip_reason"
                )
                .order("id")
                .range(page * page_size, (page + 1) * page_size - 1)
                .execute()
            )

        batch = resp.data or []
        all_orgs.extend(batch)

        if len(batch) < page_size:
            break

        page += 1

    unprocessed = []
    parked = 0

    for o in all_orgs:
        if not include_parked and o.get("assessment_skip_reason") is not None:
            parked += 1
            continue

        needs = _missing_org_fields(o)

        if needs:
            unprocessed.append((o, needs))

    if parked:
        _log(
            f"Skipping {parked} parked org(s) awaiting review "
            "(use --include-parked to reassess them)"
        )

    return all_orgs, unprocessed


def process_unprocessed_jobs(unprocessed, skip_esco=False):
    """Run unified post-processor on unprocessed jobs, then ESCO skills tagging."""
    if not unprocessed:
        _log("No unprocessed jobs — skipping job post-processing.")
        return 0, 0

    job_ids = [j["id"] for j, _ in unprocessed]
    _log(f"Processing {len(job_ids)} jobs in chunks...")

    from scripts.tag_esco_skills_vector import tag_esco_skills_vector
    from scripts.unified_post_processor import (
        ProcessingOptions,
        process_jobs_unified,
    )

    unified_processed = 0
    unified_errors = 0
    esco_processed = 0
    esco_errors = 0

    chunk_size = 100

    for i in range(0, len(job_ids), chunk_size):
        chunk = job_ids[i : i + chunk_size]
        _log(f"--- Job Chunk {i // chunk_size + 1} ({len(chunk)} jobs) ---")

        # 1) Unified post-processor
        unified_chunk = [
            j["id"]
            for j, needs in unprocessed[i : i + chunk_size]
            if any(req in needs for req in ("summary", "values", "sse", "language"))
        ]

        if unified_chunk:
            try:
                result = process_jobs_unified(
                    ProcessingOptions(
                        task="all",
                        page_limit=None,
                        job_ids=unified_chunk,
                        dry_run=False,
                        verbose=False,
                    )
                )

                unified_errors += result.get("errors", 0)
                unified_processed += result.get("processed", 0)

            except Exception as e:
                _log(f"✗ Unified post-processor failed for chunk: {e}")
                unified_errors += len(unified_chunk)

        # 2) ESCO skills tagging
        if not skip_esco:
            try:
                esco_chunk = [
                    j["id"]
                    for j, needs in unprocessed[i : i + chunk_size]
                    if "skills" in needs
                ]

                if esco_chunk:
                    esco_result = tag_esco_skills_vector(job_ids=esco_chunk)
                    esco_processed += esco_result.get("processed", 0)
                    esco_errors += esco_result.get("errors", 0)

            except Exception as e:
                _log(f"ESCO tagging failed for chunk: {e}")
                esco_errors += len(chunk)

    _log(
        f"Unified post-processor: "
        f"processed={unified_processed}, errors={unified_errors}"
    )
    _log(
        f"ESCO tagging: "
        f"processed={esco_processed}, errors={esco_errors}"
    )

    return unified_processed, unified_errors


def _missing_org_fields(org):
    """Return the required organization fields that are still missing.

    Delegates to catch_up so this script and the scraper cannot disagree about
    what "complete" means.
    """
    return find_missing_org_fields(org)


def process_unprocessed_orgs(unprocessed):
    """Re-assess incomplete organizations using OrganizationAssessor."""
    if not unprocessed:
        _log("No unprocessed organizations — skipping org assessment.")
        return 0, 0

    _log(f"Assessing {len(unprocessed)} organizations...")

    from llm.tavily_grounding import is_tavily_available
    from utils.organization_assessment import OrganizationAssessor

    if not is_tavily_available():
        _log(
            "⚠️  Tavily not available — org quality will be degraded "
            "but continuing anyway"
        )

    assessor = OrganizationAssessor()

    assessed = 0
    updated = 0
    completed = 0
    parked = 0
    errors = 0

    for i, (org, _initial_needs) in enumerate(unprocessed, 1):
        name = org.get("name") or "(unnamed)"
        municipality = org.get("municipality")
        province = org.get("province")
        website = org.get("website")

        try:
            existing_description = (
                org.get("description_en") or org.get("description")
            )

            outcome = assessor.assess_with_outcome(
                raw_name=name,
                municipality=municipality,
                province=province,
                job_title="",
                description="",
                known_website=website,
                existing_description=existing_description,
            )

            assessed += 1

            write = persist_org_assessment_outcome(org, outcome)
            filtered = write.filtered
            reason = write.reason

            if not write.applied:
                errors += 1
                _log(f"  ⚠️  Org [{name}] skipped: row changed since read")
                continue

            if filtered:
                updated += 1

            if reason is None:
                completed += 1
            else:
                parked += 1

                if outcome.result is None:
                    errors += 1

                missing = _missing_org_fields(org)

                _log(
                    f"  ⏸  Org [{name}] parked ({reason}) — "
                    f"still missing: {', '.join(missing) or 'nothing'}"
                )

        except Exception as e:
            missing = _missing_org_fields(org)

            _log(
                f"  Org [{name}] error: {e} — "
                f"missing: {', '.join(missing)}"
            )

            errors += 1
            parked += 1

            _park_org(org, SKIP_REASON_EXCEPTION)

        if i % 50 == 0 or i == 1:
            _log(
                f"  Orgs: {i}/{len(unprocessed)} | "
                f"assessed={assessed} | "
                f"updated={updated} | "
                f"completed={completed} | "
                f"parked={parked} | "
                f"errors={errors}"
            )

        # Gentle pace so Gemini free tier doesn't 429/503 us into a long cooldown.
        try:
            delay_s = float(
                os.environ.get("ORG_ASSESS_DELAY_SECONDS", "2.5")
            )
        except ValueError:
            delay_s = 2.5

        if delay_s > 0:
            time.sleep(delay_s)

    still_incomplete = len(unprocessed) - completed

    _log(
        f"Org assessment done: "
        f"assessed={assessed}, "
        f"updated={updated}, "
        f"completed={completed}, "
        f"parked={parked}, "
        f"still_incomplete={still_incomplete}, "
        f"errors={errors}"
    )

    if parked:
        _log(
            f"{parked} org(s) parked for review — see the Needs review filter "
            "on the admin organizations page."
        )

    return completed, errors


def _parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Process unprocessed orgs and jobs in the prod DB.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help=(
            "Max organizations to assess. Defaults to CATCH_UP_ORG_LIMIT "
            f"(currently {org_batch_limit()}). Use 0 for unlimited."
        ),
    )
    parser.add_argument(
        "--include-parked",
        action="store_true",
        help=(
            "Also reassess organizations parked with an assessment_skip_reason. "
            "This spends credits on rows a previous attempt gave up on."
        ),
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = _parse_args(argv)
    limit = org_batch_limit() if args.limit is None else args.limit

    _log("=" * 70)
    _log("PROCESSING UNPROCESSED ORGS + JOBS (PROD)")
    _log("=" * 70)

    _, unprocessed_jobs = fetch_unprocessed_jobs()
    _, unprocessed_orgs = fetch_unprocessed_orgs(include_parked=args.include_parked)

    if limit > 0 and len(unprocessed_orgs) > limit:
        _log(
            f"Limiting to first {limit} of {len(unprocessed_orgs)} eligible orgs "
            "(--limit 0 for unlimited)."
        )
        unprocessed_orgs = unprocessed_orgs[:limit]

    _log(
        f"Found {len(unprocessed_jobs)} unprocessed jobs, "
        f"{len(unprocessed_orgs)} orgs to assess."
    )

    if not unprocessed_jobs and not unprocessed_orgs:
        _log("✅ Nothing to process.")
        return

    # ── Process ORGS first (so jobs can resolve organization_id links) ────────
    org_ok, org_err = 0, 0

    if unprocessed_orgs:
        t0 = time.time()
        org_ok, org_err = process_unprocessed_orgs(unprocessed_orgs)

        _log(
            f"ORGS: {org_ok} completed, {org_err} errors  "
            f"({time.time() - t0:.1f}s)"
        )

    # ── Process JOBS ─────────────────────────────────────────────────────────
    job_ok, job_err = 0, 0

    if unprocessed_jobs:
        t0 = time.time()
        job_ok, job_err = process_unprocessed_jobs(unprocessed_jobs)

        _log(
            f"JOBS: {job_ok} processed, {job_err} errors  "
            f"({time.time() - t0:.1f}s)"
        )

    _log("\n" + "=" * 70)
    _log("FINAL SUMMARY")
    _log("=" * 70)

    _log(
        f"Organizations: "
        f"{org_ok}/{len(unprocessed_orgs)} completed  "
        f"({org_err} errors)"
    )

    _log(
        f"Jobs:          "
        f"{job_ok}/{len(unprocessed_jobs)} processed  "
        f"({job_err} errors)"
    )

    _log("=" * 70)


if __name__ == "__main__":
    main()
