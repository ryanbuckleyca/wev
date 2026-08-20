#!/usr/bin/env python3
"""Query prod DB for unprocessed orgs and jobs."""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

os.environ["USE_PROD_DB"] = "1"
os.environ["PROD_CONFIRMED"] = "1"
os.environ["CONFIRM_PROD_RUN"] = "YES"
os.environ["ENV_MODE"] = "prod"

SCRIPT_DIR = Path(__file__).resolve().parent
SCRAPER_DIR = SCRIPT_DIR.parent if SCRIPT_DIR.name == "scripts" else SCRIPT_DIR
REPO_ROOT = SCRAPER_DIR.parent

sys.path.insert(0, str(SCRAPER_DIR))

for env_file in [REPO_ROOT / ".env", REPO_ROOT / ".env.production"]:
    if env_file.exists():
        load_dotenv(env_file, override=True)

from settings import get_supabase_settings  # noqa: E402
from utils.db import supabase  # noqa: E402

config = get_supabase_settings()
print(f"DB URL: {config.url}")
print()

print("=" * 70)
print("UNPROCESSED JOBS")
print("=" * 70)

# Jobs: unprocessed = missing summary OR missing values OR is_sse IS NULL OR language NOT IN (en,fr,bilingual) OR organization_id IS NULL OR skills IS NULL
job_resp = supabase.table("jobs").select("id, job_title, organization, listing_url, summary, values, is_sse, language, organization_id, skills, scraped_at").execute()
all_jobs = job_resp.data or []
print(f"Total jobs in DB: {len(all_jobs)}")

unprocessed_jobs = []
for j in all_jobs:
    reasons = []
    if not (j.get("summary") or "").strip():
        reasons.append("no_summary")
    if not j.get("values"):
        reasons.append("no_values")
    if j.get("is_sse") is None:
        reasons.append("no_sse")
    lang = j.get("language")
    if lang not in ("en", "fr", "bilingual"):
        reasons.append(f"bad_language:{lang}")
    if j.get("organization_id") is None:
        reasons.append("no_org_id")
    if not j.get("skills"):
        reasons.append("no_skills")
    if reasons:
        unprocessed_jobs.append((j, reasons))

print(f"Unprocessed jobs: {len(unprocessed_jobs)}")

# Show breakdown
breakdown = {}
for _, reasons in unprocessed_jobs:
    for r in reasons:
        key = r.split(":")[0]
        breakdown[key] = breakdown.get(key, 0) + 1
for k, v in sorted(breakdown.items(), key=lambda x: -x[1]):
    print(f"  {k}: {v}")

# Sample
if unprocessed_jobs:
    print("\nSample unprocessed jobs:")
    for j, reasons in unprocessed_jobs[:10]:
        print(f"  [{j['id'][:8]}] {j.get('job_title', '?')[:60]} | {j.get('organization', '?')[:40]} | reasons={','.join(reasons)}")

# Save unprocessed job IDs for processing
job_ids_path = SCRAPER_DIR / "scripts" / "_unprocessed_job_ids.txt"
with open(job_ids_path, "w") as f:
    for j, _ in unprocessed_jobs:
        f.write(j["id"] + "\n")
print(f"\nSaved {len(unprocessed_jobs)} unprocessed job IDs to {job_ids_path}")

print()
print("=" * 70)
print("UNPROCESSED ORGANIZATIONS")
print("=" * 70)

# Organizations: unprocessed = missing sector_id OR missing type OR missing description_en OR missing description_fr OR missing language
# First check columns exist
try:
    org_resp = supabase.table("organizations").select("id, name, sector_id, type, description, mission_statement, values_list, values_rated, language, municipality, province, slug, website, location, is_sse, sse_rating, created_at, updated_at").execute()
except Exception as e:
    print(f"Warning: Some columns may not exist, trying reduced select: {e}")
    org_resp = supabase.table("organizations").select("*").execute()

all_orgs = org_resp.data or []
print(f"Total orgs in DB: {len(all_orgs)}")

unprocessed_orgs = []
for o in all_orgs:
    reasons = []
    if not o.get("sector_id"):
        reasons.append("no_sector")
    if not o.get("type"):
        reasons.append("no_type")
    # description_en/description_fr might be stored as description with locale suffix
    desc_en = o.get("description_en") or o.get("description")
    desc_fr = o.get("description_fr")
    if not (desc_en or "").strip():
        reasons.append("no_desc_en")
    if not (desc_fr or "").strip():
        reasons.append("no_desc_fr")
    lang = o.get("language")
    if lang not in ("en", "fr", "bilingual"):
        reasons.append(f"bad_language:{lang}")
    if o.get("is_sse") is None:
        reasons.append("no_sse")
    if not o.get("website"):
        reasons.append("no_website")
    if not o.get("values_list"):
        reasons.append("no_values_list")
    if reasons:
        unprocessed_orgs.append((o, reasons))

print(f"Unprocessed orgs: {len(unprocessed_orgs)}")

breakdown = {}
for _, reasons in unprocessed_orgs:
    for r in reasons:
        key = r.split(":")[0]
        breakdown[key] = breakdown.get(key, 0) + 1
for k, v in sorted(breakdown.items(), key=lambda x: -x[1]):
    print(f"  {k}: {v}")

if unprocessed_orgs:
    print("\nSample unprocessed orgs:")
    for o, reasons in unprocessed_orgs[:20]:
        print(f"  [id={o.get('id')}] {str(o.get('name', '?'))[:60]} | reasons={','.join(reasons)}")

# Save unprocessed org IDs for processing
org_ids_path = SCRAPER_DIR / "scripts" / "_unprocessed_org_ids.txt"
with open(org_ids_path, "w") as f:
    for o, _ in unprocessed_orgs:
        f.write(str(o["id"]) + "\n")
print(f"\nSaved {len(unprocessed_orgs)} unprocessed org IDs to {org_ids_path}")
