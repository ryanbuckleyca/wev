#!/usr/bin/env python3
"""Process all unprocessed orgs and jobs in prod DB."""
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# ── Env setup: target PROD DB with confirmation bypass ───────────────────
os.environ["USE_PROD_DB"] = "1"
os.environ["PROD_CONFIRMED"] = "1"
os.environ["CONFIRM_PROD_RUN"] = "YES"
os.environ["ENV_MODE"] = "prod"

SCRIPT_DIR = Path(__file__).resolve().parent
SCRAPER_DIR = SCRIPT_DIR.parent if SCRIPT_DIR.name == "scripts" else SCRIPT_DIR
REPO_ROOT = SCRAPER_DIR.parent
sys.path.insert(0, str(SCRAPER_DIR))

from dotenv import load_dotenv
for env_file in [REPO_ROOT / ".env", REPO_ROOT / ".env.production"]:
    if env_file.exists():
        load_dotenv(env_file, override=True)

from settings import get_supabase_settings
from utils.db import supabase
from utils.log import scraper_log as _log

config = get_supabase_settings()
_log(f"DB URL: {config.url}")

VALID_LANGUAGES = {"en", "fr", "bilingual"}


def fetch_unprocessed_jobs():
    """Fetch all jobs that lack summary/values/sse/language/skills OR organization_id."""
    _log("Fetching jobs from DB...")
    all_jobs = []
    page = 0
    page_size = 1000
    while True:
        resp = (
            supabase.table("jobs")
            .select("id, listing_url, summary, values, is_sse, language, organization_id, skills, description, job_title, organization, scraped_at")
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
        if needs:
            unprocessed.append((j, needs))
    return all_jobs, unprocessed


def fetch_unprocessed_orgs():
    """Fetch all orgs missing sector_id/type/descriptions/language/values_list."""
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
        except Exception:
            resp = (
                supabase.table("organizations")
                .select("id,name,sector_id,type,description,website,location,is_sse,sse_rating,mission_statement,values_list,values_rated,language,municipality,province,lat,lng,geocode_accuracy_type,created_at")
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
    for o in all_orgs:
        needs = []
        if not o.get("sector_id"):
            needs.append("sector_id")
        if not o.get("type"):
            needs.append("type")
        desc_en = o.get("description_en") or o.get("description")
        desc_fr = o.get("description_fr")
        if not (desc_en or "").strip():
            needs.append("description_en")
        if not (desc_fr or "").strip():
            needs.append("description_fr")
        if o.get("language") not in VALID_LANGUAGES:
            needs.append("language")
        if not o.get("values_list"):
            needs.append("values_list")
        if needs:
            unprocessed.append((o, needs))
    return all_orgs, unprocessed


def process_unprocessed_jobs(unprocessed, skip_esco=False):
    """Run unified post-processor on unprocessed jobs, then ESCO skills tagging."""
    if not unprocessed:
        _log("No unprocessed jobs — skipping job post-processing.")
        return 0, 0

    job_ids = [j["id"] for j, _ in unprocessed]
    _log(f"Processing {len(job_ids)} jobs in chunks...")

    from scripts.unified_post_processor import process_jobs_unified, ProcessingOptions
    from scripts.tag_esco_skills_vector import tag_esco_skills_vector

    unified_processed = 0
    unified_errors = 0
    esco_processed = 0
    esco_errors = 0

    chunk_size = 100
    for i in range(0, len(job_ids), chunk_size):
        chunk = job_ids[i:i + chunk_size]
        _log(f"--- Job Chunk {i//chunk_size + 1} ({len(chunk)} jobs) ---")

        # 1) Unified post-processor
        try:
            result = process_jobs_unified(ProcessingOptions(
                task="all",
                page_limit=None,
                job_ids=chunk,
                dry_run=False,
                verbose=False,
            ))
            unified_errors += result.get("errors", 0)
            unified_processed += result.get("processed", 0)
        except Exception as e:
            _log(f"✗ Unified post-processor failed for chunk: {e}")
            unified_errors += len(chunk)

        # 2) ESCO skills tagging
        if not skip_esco:
            try:
                esco_chunk = [j["id"] for j, needs in unprocessed[i:i + chunk_size] if "skills" in needs]
                if esco_chunk:
                    esco_result = tag_esco_skills_vector(job_ids=esco_chunk)
                    esco_processed += esco_result.get("processed", 0)
                    esco_errors += esco_result.get("errors", 0)
            except Exception as e:
                _log(f"ESCO tagging failed for chunk: {e}")
                esco_errors += len(chunk)

    _log(f"Unified post-processor: processed={unified_processed}, errors={unified_errors}")
    _log(f"ESCO tagging: processed={esco_processed}, errors={esco_errors}")

    return unified_processed, unified_errors


def process_unprocessed_orgs(unprocessed):
    """Re-assess incomplete organizations using OrganizationAssessor."""
    if not unprocessed:
        _log("No unprocessed organizations — skipping org assessment.")
        return 0, 0

    _log(f"Assessing {len(unprocessed)} organizations...")

    from llm.tavily_grounding import is_tavily_available
    from utils.organization_assessment import OrganizationAssessor, _result_to_db_fields

    if not is_tavily_available():
        _log("⚠️  Tavily not available — org quality will be degraded but continuing anyway")

    assessor = OrganizationAssessor()

    success = 0
    errors = 0
    for i, (org, needs) in enumerate(unprocessed, 1):
        oid = org["id"]
        name = org.get("name") or "(unnamed)"
        municipality = org.get("municipality")
        province = org.get("province")
        website = org.get("website")

        if i % 50 == 0 or i == 1:
            _log(f"  Orgs: {i}/{len(unprocessed)} | successes={success} | errors={errors}")

        try:
            existing_description = org.get("description_en") or org.get("description")

            result = assessor.assess(
                raw_name=name,
                municipality=municipality,
                province=province,
                job_title="",
                description="",
                known_website=website,
                existing_description=existing_description,
            )

            if result:
                update_fields = _result_to_db_fields(result)
                # Only populate missing fields, keep existing data
                filtered = {}
                for field, value in update_fields.items():
                    if not org.get(field) and value:
                        filtered[field] = value
                # Always update language/values_list if they came back and were missing
                for field in ["language", "values_list", "values_rated"]:
                    if field in update_fields and update_fields[field] and not org.get(field):
                        filtered[field] = update_fields[field]

                if filtered:
                    supabase.table("organizations").update(filtered).eq("id", oid).execute()
                    success += 1
                else:
                    success += 1  # assessor ran but nothing new to write
            else:
                errors += 1

        except Exception as e:
            _log(f"  Org [{name}] error: {e}")
            errors += 1

        # Gentle pace so Gemini free tier doesn't 429/503 us into a long cooldown.
        try:
            delay_s = float(os.environ.get("ORG_ASSESS_DELAY_SECONDS", "2.5"))
        except ValueError:
            delay_s = 2.5
        if delay_s > 0:
            time.sleep(delay_s)

    _log(f"Org assessment done: success={success}, errors={errors}")
    return success, errors


def main():
    _log("=" * 70)
    _log("PROCESSING UNPROCESSED ORGS + JOBS (PROD)")
    _log("=" * 70)

    _, unprocessed_jobs = fetch_unprocessed_jobs()
    _, unprocessed_orgs = fetch_unprocessed_orgs()

    _log(f"Found {len(unprocessed_jobs)} unprocessed jobs, {len(unprocessed_orgs)} unprocessed orgs.")

    if not unprocessed_jobs and not unprocessed_orgs:
        _log("✅ Nothing to process.")
        return

    # ── Process JOBS first ────────────────────────────────────────────────────
    job_ok, job_err = 0, 0
    if unprocessed_jobs:
        t0 = time.time()
        job_ok, job_err = process_unprocessed_jobs(unprocessed_jobs)
        _log(f"JOBS: {job_ok} processed, {job_err} errors  ({time.time()-t0:.1f}s)")

    # ── Process ORGS (so jobs can get organization_id links) ───────
    org_ok, org_err = 0, 0
    if unprocessed_orgs:
        t0 = time.time()
        org_ok, org_err = process_unprocessed_orgs(unprocessed_orgs)
        _log(f"ORGS: {org_ok} ok, {org_err} errors  ({time.time()-t0:.1f}s)")

    _log("\n" + "=" * 70)
    _log("FINAL SUMMARY")
    _log("=" * 70)
    _log(f"Organizations: {org_ok}/{len(unprocessed_orgs)} ok  ({org_err} errors)")
    _log(f"Jobs:          {job_ok}/{len(unprocessed_jobs)} processed  ({job_err} errors)")
    _log("=" * 70)


if __name__ == "__main__":
    main()
