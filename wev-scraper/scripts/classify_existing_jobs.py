#!/usr/bin/env python
"""Batch processor for SSE classification of existing jobs in Supabase.

Usage:
    python classify_existing_jobs.py [--job-id ID] [--limit N]
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone


# --prod must be checked before utils.db is imported so USE_PROD_DB is set
# before the Supabase client is created at module load time.
if '--prod' in sys.argv[1:]:
    _confirm = os.environ.get("CONFIRM_PROD_RUN")
    if sys.stdin.isatty():
        print("\nWARNING: You are about to run against the PRODUCTION database.")
        print("This will modify real data.\n")
        _resp = input("Type YES to continue, anything else to abort: ")
        if _resp.strip() != "YES":
            print("Aborted.")
            sys.exit(1)
    elif _confirm != "YES":
        print("Refusing to run against production in non-interactive mode. Set CONFIRM_PROD_RUN=YES to override.")
        sys.exit(1)
    os.environ["USE_PROD_DB"] = "1"
    print("🔥 Using PRODUCTION database")
else:
    print("🧪 Using TEST database")

from utils.sse_classifier import SSEClassifier, SSEClassificationError
from utils.db import supabase, fetch_all_rows


def classify_existing_jobs(
    limit: int = 100,
    delay_seconds: float = 2.0,
    verbose: bool = True,
    reclassify: bool = False,
) -> dict:
    """Classify existing jobs in Supabase using individual calls for proper grounding.
    
    Each job gets its own API call with Google Search grounding to ensure
    accurate organization research for SSE classification.
    
    Returns:
        Dict with counts: {classified, skipped, errors}
    """
    
    if verbose:
        print("=" * 70)
        print("SSE JOB CLASSIFICATION - INDIVIDUAL PROCESSOR")
        print("=" * 70)
        print("Mode: Individual API calls with Google Search grounding")
        print("Benefit: Accurate organization research per job")
        print(f"Rate limit delay: {delay_seconds}s between classifications")
        print()

    # Initialize classifier
    try:
        classifier = SSEClassifier()
        if verbose:
            print("✓ Gemini classifier initialized")
            try:
                import os
                key = os.environ.get("GEMINI_API_KEY") or ""
                if key:
                    print(f"  GEMINI_API_KEY (last4): {key[-4:]}")
                else:
                    print("  GEMINI_API_KEY not set")
            except Exception:
                print("  GEMINI_API_KEY check failed")
    except SSEClassificationError as e:
        print(f"✗ Failed to initialize classifier: {e}")
        return {"classified": 0, "skipped": 0, "errors": 0}

    query_desc = "all jobs" if reclassify else "unclassified jobs"
    if verbose:
        print(f"Fetching {query_desc} (paginated)...")

    try:
        if limit > 0:
            query = supabase.table("jobs").select("*")
            if not reclassify:
                query = query.filter("sse_rating", "is", "null")
            resp = query.order("id", desc=True).range(0, limit - 1).execute()
            jobs = resp.data or []
            query_desc = f"first {limit} {query_desc}"
        elif reclassify:
            jobs = fetch_all_rows("jobs", "*")
        else:
            from utils.db import PAGE_SIZE
            jobs = []
            offset = 0
            while True:
                resp = (
                    supabase.table("jobs")
                    .select("*")
                    .filter("sse_rating", "is", "null")
                    .order("id", desc=True)
                    .range(offset, offset + PAGE_SIZE - 1)
                    .execute()
                )
                batch = resp.data or []
                jobs.extend(batch)
                if len(batch) < PAGE_SIZE:
                    break
                offset += PAGE_SIZE
    except Exception as e:
        print(f"✗ Database query failed: {e}")
        return {"classified": 0, "skipped": 0, "errors": 0}

    if not jobs:
        print(f"No jobs found to classify.")
        return {"classified": 0, "skipped": 0, "errors": 0}

    if verbose:
        print(f"Found {len(jobs)} jobs to process\n")

    counts = {"classified": 0, "skipped": 0, "errors": 0}

    # Process jobs individually for proper grounding per organization
    for i, job in enumerate(jobs, start=1):
        job_num = i
        
        if verbose:
            print(f"[{job_num}/{len(jobs)}] Processing job...")

        try:
            # Prepare job data for classifier
            job_input = {
                "org_name": job.get("organization", "Unknown"),
                "title": job.get("job_title", "Unknown"),
                "location": job.get("location", "Unknown"),
                "salary": job.get("wage", "Not specified"),
                "description": job.get("description", ""),
                "posted_date": job.get("date_posted", datetime.now(timezone.utc).isoformat()),
            }

            # Classify individual job
            result = classifier.classify_job(job_input)

            # Update database for this job
            job_id = job.get("id")
            job_title = job.get("job_title", "Unknown")
            org_name = job.get("organization", "Unknown")
            listing_url = job.get("listing_url", "No URL")
            
            if verbose:
                print(f"  {org_name} - {job_title}")
                print(f"  URL: {listing_url}")
                
                # Format rating as "Is SSE"
                rating_map = {
                    "strong_yes": "✓ Yes",
                    "weak_yes": "~ Weak Yes",
                    "no": "✗ No"
                }
                sse_status = rating_map.get(result['rating'], result['rating'])
                print(f"  Is SSE: {sse_status} ({result['confidence']:.2f})")
                print(f"  Reasoning: {result['reasoning']}")
                
                if result.get('must_haves_met'):
                    print(f"  Must-haves met:")
                    for item in result['must_haves_met']:
                        print(f"    ✓ {item}")
                
                if result.get('nice_to_haves_met'):
                    print(f"  Nice-to-haves met:")
                    for item in result['nice_to_haves_met']:
                        print(f"    ✓ {item}")
                
                if result.get('flags'):
                    print(f"  Flags:")
                    for flag in result['flags']:
                        print(f"    ⚠ {flag}")

            # Determine is_sse from rating
            is_sse = None
            if result["rating"] in ("strong_yes", "weak_yes"):
                is_sse = True
            elif result["rating"] == "no":
                is_sse = False

            # Update database (remove rating from sse_details since it's in sse_rating column)
            try:
                # Create normalized sse_details with consistent field order
                sse_details = {
                    "confidence": result.get("confidence"),
                    "reasoning": result.get("reasoning"),
                    "must_haves_met": result.get("must_haves_met", []),
                    "nice_to_haves_met": result.get("nice_to_haves_met", []),
                    "flags": result.get("flags", []),
                    "classified_at": result.get("classified_at"),
                    "reviewed": result.get("reviewed", False),
                }
                
                update_data = {
                    "sse_rating": result["rating"],
                    "sse_details": json.dumps(sse_details) if isinstance(sse_details, dict) else sse_details,
                }
                if is_sse is not None:
                    update_data["is_sse"] = is_sse
                
                supabase.table("jobs").update(update_data).eq("id", job_id).execute()
                if verbose:
                    print(f"  ✅ Updated in database")
                
                counts["classified"] += 1
                
            except Exception as e:
                print(f"  ❌ Database update failed: {e}")
                counts["errors"] += 1
            
        except Exception as e:
            print(f"  ❌ Classification failed: {e}")
            counts["errors"] += 1
        
        # Rate limiting between individual jobs
        if delay_seconds > 0 and i < len(jobs):
            time.sleep(delay_seconds)

    # Summary
    if verbose:
        print(f"\n✅ Processing complete!")
        print(f"Classified: {counts['classified']}")
        print(f"Skipped: {counts['skipped']}")
        print(f"Errors: {counts['errors']}")
    
    return counts


def classify_single_job(job_id: str, verbose: bool = True) -> bool:
    """Classify a single job by ID."""
    
    if verbose:
        print("=" * 70)
        print("SSE JOB CLASSIFICATION - SINGLE JOB")
        print("=" * 70)
        print(f"Job ID: {job_id}")
        print()

    # Initialize classifier
    try:
        classifier = SSEClassifier()
        if verbose:
            print("✓ Gemini classifier initialized")
    except SSEClassificationError as e:
        print(f"✗ Failed to initialize classifier: {e}")
        return False

    # Fetch the job
    try:
        response = supabase.table("jobs").select("*").eq("id", job_id).execute()
        jobs = response.data or []
    except Exception as e:
        print(f"✗ Database query failed: {e}")
        return False

    if not jobs:
        print(f"✗ Job not found with ID: {job_id}")
        return False

    job = jobs[0]
    if verbose:
        print(f"Found: {job.get('organization', 'Unknown')} - {job.get('job_title', 'Unknown')}")
        print()

    # Classify the job
    try:
        job_input = {
            "org_name": job.get("organization", "Unknown"),
            "title": job.get("job_title", "Unknown"),
            "location": job.get("location", "Unknown"),
            "salary": job.get("wage", "Not specified"),
            "description": job.get("description", ""),
            "posted_date": job.get("date_posted", datetime.now(timezone.utc).isoformat()),
        }

        result = classifier.classify_job(job_input)

        if verbose:
            print("CLASSIFICATION RESULT")
            print("-" * 70)
            
            # Format rating as "Is SSE"
            rating_map = {
                "strong_yes": "✓ Yes",
                "weak_yes": "~ Weak Yes",
                "no": "✗ No"
            }
            sse_status = rating_map.get(result['rating'], result['rating'])
            print(f"Is SSE: {sse_status} ({result['confidence']:.2f})")
            print(f"Reasoning: {result['reasoning']}")
            print(f"\nMust-haves met:")
            for item in result.get("must_haves_met", []):
                print(f"  ✓ {item}")
            print(f"\nNice-to-haves met:")
            for item in result.get("nice_to_haves_met", []):
                print(f"  ✓ {item}")
            if result.get("flags"):
                print(f"\nFlags:")
                for flag in result["flags"]:
                    print(f"  ⚠ {flag}")
            print()

        # Update database (remove rating from sse_details since it's in sse_rating column)
        is_sse = None
        if result["rating"] in ("strong_yes", "weak_yes"):
            is_sse = True
        elif result["rating"] == "no":
            is_sse = False

        # Create normalized sse_details with consistent field order
        sse_details = {
            "confidence": result.get("confidence"),
            "reasoning": result.get("reasoning"),
            "must_haves_met": result.get("must_haves_met", []),
            "nice_to_haves_met": result.get("nice_to_haves_met", []),
            "flags": result.get("flags", []),
            "classified_at": result.get("classified_at"),
            "reviewed": result.get("reviewed", False),
        }
        update_data = {
            "sse_rating": result.get("rating"),
            "sse_details": sse_details,
        }
        if is_sse is not None:
            update_data["is_sse"] = is_sse

        try:
            supabase.table("jobs").update(update_data).eq("id", job_id).execute()
        except Exception as db_error:
            print(f"\n✗ Database update failed: {db_error}")
            print(f"   Trying with just is_sse update...")
            try:
                # Try updating just is_sse if rating update fails
                if is_sse is not None:
                    supabase.table("jobs").update({"is_sse": is_sse}).eq("id", job_id).execute()
                    print(f"   ✓ Updated is_sse to {is_sse}")
            except:
                pass
            return False
        
        if verbose:
            print("✓ Database updated")
            print(f"  sse_rating: {result['rating']}")
            print(f"  is_sse: {is_sse}")
            print()
        
        return True

    except SSEClassificationError as e:
        print(f"✗ Classification failed: {e}")
        return False
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Classify existing jobs as SSE-aligned or corporate"
    )
    parser.add_argument(
        "--job-id",
        type=str,
        help="Classify a single job by ID (UUID)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Maximum jobs to process (default: 0 for unlimited)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=2.0,
        help="Delay between individual job classifications in seconds (default: 2.0)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Minimal output",
    )
    parser.add_argument(
        "--prod",
        action="store_true",
        help="Use production database (confirmed at startup).",
    )
    args = parser.parse_args()

    # Handle single job classification
    if args.job_id:
        success = classify_single_job(args.job_id, verbose=not args.quiet)
        return 0 if success else 1

    import os
    from utils.env import is_truthy_env
    should_reclassify = is_truthy_env("SHOULD_RE_CLASSIFY")
    if should_reclassify:
        print("Reclassify: enabled (SHOULD_RE_CLASSIFY=1)")

    counts = classify_existing_jobs(
        limit=args.limit,
        delay_seconds=args.delay,
        verbose=not args.quiet,
        reclassify=should_reclassify,
    )

    return 0 if counts["errors"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
