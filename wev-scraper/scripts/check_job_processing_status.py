#!/usr/bin/env python3
"""Check which jobs need raw_skills or skills processing."""

import argparse
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# Load environment variables from repo root
from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv())


def query_all_jobs(supabase_url: str, service_role_key: str) -> list[dict]:
    """Query all jobs with their skills and raw_skills."""
    base_url = supabase_url.rstrip("/")
    endpoint = f"{base_url}/rest/v1/jobs?select=id,job_title,organization,skills,raw_skills,scraped_at"

    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Accept": "application/json",
    }

    req = Request(endpoint, headers=headers, method="GET")
    try:
        with urlopen(req, timeout=30) as resp:
            body = resp.read()
            jobs = json.loads(body.decode("utf-8"))
            return jobs if isinstance(jobs, list) else []
    except (HTTPError, URLError) as e:
        print(f"Error querying jobs: {e}")
        if hasattr(e, 'read'):
            print(f"Response: {e.read().decode('utf-8', errors='replace')[:500]}")  # type: ignore[union-attr]
        return []


def main():
    parser = argparse.ArgumentParser(description="Check job processing status")
    parser.add_argument(
        "--supabase-url",
        default=os.getenv("SUPABASE_PROD_URL") or os.getenv("SUPABASE_URL"),
        help="Supabase project URL",
    )
    parser.add_argument(
        "--supabase-key",
        default=os.getenv("SUPABASE_PROD_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
        help="Supabase service role key",
    )
    parser.add_argument(
        "--min-raw-skills",
        type=int,
        default=5,
        help="Minimum expected raw_skills (default: 5)",
    )
    parser.add_argument(
        "--min-skills",
        type=int,
        default=5,
        help="Minimum expected skills (default: 5)",
    )

    args = parser.parse_args()

    if not args.supabase_url or not args.supabase_key:
        print("Error: Missing Supabase credentials")
        return 1

    print("Querying all jobs...")
    jobs = query_all_jobs(args.supabase_url, args.supabase_key)

    if not jobs:
        print("No jobs found.")
        return 0

    # Categorize jobs
    need_raw_skills = []
    need_skills = []
    fully_processed = []

    for job in jobs:
        skills = job.get("skills") or []
        raw_skills = job.get("raw_skills") or []

        needs_raw = len(raw_skills) < args.min_raw_skills
        needs_esco = len(skills) < args.min_skills

        if needs_raw:
            need_raw_skills.append(job)
        if needs_esco:
            need_skills.append(job)
        if not needs_raw and not needs_esco:
            fully_processed.append(job)

    print(f"\n{'='*70}")
    print(f"Total jobs: {len(jobs)}")
    print(f"{'='*70}")
    print(f"✓ Fully processed: {len(fully_processed)} jobs")
    print(f"  (>= {args.min_raw_skills} raw_skills AND >= {args.min_skills} skills)")
    print()
    print(f"⚠️  Need raw_skills extraction: {len(need_raw_skills)} jobs")
    print(f"  (< {args.min_raw_skills} raw_skills)")
    print()
    print(f"⚠️  Need ESCO skills tagging: {len(need_skills)} jobs")
    print(f"  (< {args.min_skills} skills)")
    print(f"{'='*70}")

    # Show samples
    if need_raw_skills:
        print("\nJobs needing raw_skills (IDs):")
        for job in need_raw_skills:
            print(f"{job['id']}")

    if need_skills:
        print("\nSample jobs needing ESCO skills:")
        for i, job in enumerate(need_skills[:5], 1):
            skill_count = len(job.get("skills") or [])
            print(f"  {i}. {job.get('job_title', 'Untitled')} - {skill_count} skills")

    return 0


if __name__ == "__main__":
    sys.exit(main())
