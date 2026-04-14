#!/usr/bin/env python3
"""Unified job processing with intelligent fallback.

Processes jobs with a single LLM call to extract:
- Summary
- Raw Skills 
- Work Values
- SSE Classification (with grounding when available)

Fallback chain: gemini-flash → gemini-flash-lite → groq
"""

import sys
from typing import Any, Dict, List

from llm.unified_provider import UnifiedJobProcessor
from utils.db import supabase
from utils.dynamic_batching import create_provider_aware_batches
from utils.log import scraper_log


def process_jobs_unified(
    *,
    job_ids: List[str] | None = None,
    limit: int = 100,
    retag: bool = False,
    dry_run: bool = False,
    max_tokens_per_batch: int | None = None
) -> Dict[str, Any]:
    """Process jobs with unified LLM approach.
    
    Args:
        job_ids: Specific job IDs to process (optional).
        limit: Maximum number of jobs to process.
        retag: Whether to reprocess jobs that already have data.
        dry_run: Whether to save to database.
        max_tokens_per_batch: Override provider's recommended batch size.
        
    Returns:
        Dict with processing counts and results.
    """
    counts = {
        "processed": 0,
        "skipped_existing": 0,
        "skipped_no_text": 0,
        "errors": 0,
        "batches_processed": 0,
        "provider_used": None,
        "grounding_available": False
    }
    
    print("=" * 70)
    print("UNIFIED JOB PROCESSOR (Summary + Skills + Values + SSE)")
    print("=" * 70)
    print(f"Mode: {'specific jobs' if job_ids else f'batch (limit {limit})'}")
    print(f"Retag existing: {'yes' if retag else 'no'}")
    print(f"Dry run: {'yes' if dry_run else 'no'}")
    if max_tokens_per_batch:
        print(f"Max tokens per batch: {max_tokens_per_batch} (override)")
    print()

    # Initialize unified processor
    try:
        processor = UnifiedJobProcessor()
        token_limits = processor.get_token_limits()
        print("✓ Unified processor initialized")
        print(f"  Token limits: {token_limits['recommended_batch_size']} batch size")
    except Exception as e:
        scraper_log(f"✗ Failed to initialize unified processor: {e}")
        counts["errors"] += 1
        return counts

    # Fetch jobs
    try:
        columns = "id, organization, job_title, location, employment_type, wage, summary, description, listing_url, values, is_sse"
        
        if job_ids:
            jobs = supabase.table("jobs").select(columns).in_("id", job_ids).execute().data
        else:
            jobs = supabase.table("jobs").select(columns).limit(limit).execute().data
        
        print(f"✓ Fetched {len(jobs)} jobs from database")
    except Exception as e:
        scraper_log(f"✗ Failed to fetch jobs: {e}")
        counts["errors"] += 1
        return counts

    # Filter jobs
    filtered_jobs = []
    for job in jobs:
        # Skip if already processed and not retagging
        if not retag and job.get("summary") and job.get("values"):
            counts["skipped_existing"] += 1
            continue
            
        # Skip if no description
        if not job.get("description") or not job["description"].strip():
            counts["skipped_no_text"] += 1
            continue
            
        filtered_jobs.append(job)

    print(f"✓ Filtered to {len(filtered_jobs)} eligible jobs")
    
    if not filtered_jobs:
        print("No eligible jobs to process after filtering.")
        return counts

    # Create provider-aware dynamic batches
    batches = create_provider_aware_batches(
        items=filtered_jobs,
        provider=processor,  # Use unified processor for token limits
        content_type="jobs",
        max_tokens_override=max_tokens_per_batch
    )
    
    print(f"✓ Created {len(batches)} dynamic batches")
    for i, batch in enumerate(batches):
        from utils.dynamic_batching import estimate_tokens_for_job_batch
        estimated_tokens = estimate_tokens_for_job_batch(batch)
        print(f"  Batch {i+1}: {len(batch)} jobs, ~{estimated_tokens} tokens")
    print()

    # Process batches
    for batch_num, batch in enumerate(batches, 1):
        print(f"\n--- Batch {batch_num}/{len(batches)} ({len(batch)} jobs) ---")
        
        try:
            # Process with unified provider
            result = processor.process_jobs(batch)
            
            if result.get("error"):
                scraper_log(f"✗ Batch {batch_num} failed: {result['error']}")
                counts["errors"] += len(batch)
                continue
            
            # Update database for each job in batch
            for j, job in enumerate(batch):
                if j < len(result["results"]):
                    job_result = result["results"][j]
                    
                    if not dry_run:
                        _update_job_in_database(job["id"], job_result)
                    
                    counts["processed"] += 1
                    print(f"  [{j+1}/{len(batch)}] Job {job['id'][:8]}...: ✓ Processed")
                else:
                    scraper_log(f"✗ No result for job {job['id']}")
                    counts["errors"] += 1
            
            counts["batches_processed"] += 1
            counts["provider_used"] = result.get("provider")
            counts["grounding_available"] = result.get("has_grounding", False)
            
            print(f"  ✓ Batch {batch_num} complete using {result.get('provider')}")
            if result.get("has_grounding"):
                print("  ✓ Web grounding used for SSE classification")
            else:
                print("  ⚠ SSE classification without grounding")
                
        except Exception as e:
            scraper_log(f"✗ Batch {batch_num} failed: {e}")
            counts["errors"] += len(batch)

    return counts


def _update_job_in_database(job_id: str, result: Dict[str, Any]) -> None:
    """Update job in database with unified processing results."""
    try:
        update_data = {}
        
        if "summary" in result:
            update_data["summary"] = result["summary"]
        
        if "values" in result:
            update_data["values"] = result["values"]
        
        if "values_rated" in result:
            update_data["values_rated"] = result["values_rated"]
        
        if "is_sse" in result:
            update_data["is_sse"] = result["is_sse"]
        
        if "sse_confidence" in result:
            update_data["sse_confidence"] = result["sse_confidence"]
        
        if update_data:
            supabase.table("jobs").update(update_data).eq("id", job_id).execute()
            
    except Exception as e:
        scraper_log(f"✗ Failed to update job {job_id}: {e}")


def main():
    """CLI entry point for unified job processing."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Process jobs with unified LLM approach")
    parser.add_argument("--limit", type=int, default=100, help="Maximum jobs to process")
    parser.add_argument("--retag", action="store_true", help="Reprocess jobs with existing data")
    parser.add_argument("--dry-run", action="store_true", help="Don't save to database")
    parser.add_argument("--max-tokens", type=int, help="Override token limit per batch")
    parser.add_argument("--job-ids", nargs="+", help="Specific job IDs to process")
    
    args = parser.parse_args()
    
    result = process_jobs_unified(
        job_ids=args.job_ids,
        limit=args.limit,
        retag=args.retag,
        dry_run=args.dry_run,
        max_tokens_per_batch=args.max_tokens
    )
    
    print("\n" + "=" * 70)
    print("UNIFIED PROCESSING SUMMARY")
    print("=" * 70)
    print(f"Processed: {result['processed']}")
    print(f"Skipped (existing): {result['skipped_existing']}")
    print(f"Skipped (no text): {result['skipped_no_text']}")
    print(f"Batches processed: {result['batches_processed']}")
    print(f"Provider used: {result['provider_used']}")
    print(f"Grounding available: {result['grounding_available']}")
    print(f"Errors: {result['errors']}")
    
    if result['errors'] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
