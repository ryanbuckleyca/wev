#!/usr/bin/env python
"""Run skills matcher on the most recent N jobs."""



# Default to test database
print("🧪 Using TEST database")

# USE_PROD_DB must be set before importing utils.db, which creates the Supabase client at module load time.
from scripts.calculate_matches import calculate_matches_for_job  # noqa: E402
from utils.db import supabase  # noqa: E402


def match_recent_jobs(limit: int = 5):
    """Run matching on the N most recent jobs."""
    print(f"🎯 Fetching {limit} most recent jobs...")

    try:
        # Get most recent jobs ordered by scraped_at
        resp = supabase.table('jobs').select('id, job_title, organization, scraped_at').order('scraped_at', desc=True).limit(limit).execute()
        jobs = resp.data or []

        if not jobs:
            print("No jobs found")
            return

        print(f"\nFound {len(jobs)} jobs:")
        for i, job in enumerate(jobs, 1):
            print(f"  {i}. {job.get('job_title', 'Unknown')} at {job.get('organization', 'Unknown')}")
            print(f"     ID: {job['id']}")
            print(f"     Scraped: {job.get('scraped_at', 'Unknown')}")

        print(f"\n{'='*60}")
        print("Running matcher on each job...")
        print(f"{'='*60}\n")

        for i, job in enumerate(jobs, 1):
            print(f"\n[{i}/{len(jobs)}] Processing: {job.get('job_title', 'Unknown')}")
            calculate_matches_for_job(job['id'])

        print(f"\n{'='*60}")
        print("✅ Matching complete!")
        print(f"{'='*60}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Run matching on recent jobs')
    parser.add_argument('--limit', type=int, default=5, help='Number of recent jobs to process (default: 5)')
    args = parser.parse_args()

    match_recent_jobs(args.limit)
