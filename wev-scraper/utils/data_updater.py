"""
General data normalizer for existing database records.

Can re-run normalization on existing jobs to update standardized fields.
"""

from utils.db import supabase
from utils.normalize import normalize_job_data


def update_jobs_data(job_ids=None, force_update=False):
    """
    Re-normalize data for jobs in the database.
    
    Args:
        job_ids: Optional list of job IDs to update. If None, updates all jobs.
        force_update: If True, re-normalizes all jobs. If False, only updates jobs
                     where municipality, province, or is_remote are null.
    
    Returns:
        dict with counts: {"updated": int, "failed": int, "skipped": int}
    """
    # Fetch jobs that need updating
    query = supabase.table("jobs").select("id, job_title, organization, location, date_posted, close_date, employment_type, wage, description, listing_url")
    
    if job_ids:
        query = query.in_("id", job_ids)
    elif not force_update:
        # Only get jobs where municipality, province, or is_remote are null
        query = (
            query.is_("municipality", "null")
            .is_("province", "null")
            .is_("is_remote", "null")
        )
    
    response = query.execute()
    jobs = response.data if response.data else []
    
    if not jobs:
        print("No jobs to update.")
        return {"updated": 0, "failed": 0, "skipped": 0}
    
    print(f"Normalizing data for {len(jobs)} job(s)...")
    
    updated = 0
    failed = 0
    skipped = 0
    
    for job in jobs:
        job_id = job["id"]
        
        try:
            # Normalize all fields (includes Geocodio call with rate limiting)
            normalized = normalize_job_data(job)
            
            # Update job in database
            update_data = {
                "job_title": normalized["job_title"],
                "organization": normalized["organization"],
                "location": normalized["location"],
                "municipality": normalized["municipality"],
                "province": normalized["province"],
                "is_remote": normalized["is_remote"],
                "date_posted": normalized["date_posted"],
                "close_date": normalized["close_date"],
                "employment_type": normalized["employment_type"],
                "wage": normalized["wage"],
                "description": normalized["description"],
            }
            
            supabase.table("jobs").update(update_data).eq("id", job_id).execute()
            
            print(f"\t✓ Job {job_id} normalized")
            updated += 1
            
        except Exception as e:
            print(f"\t✗ Failed to update job {job_id}: {e}")
            failed += 1
    
    print(f"\nData normalization complete: {updated} updated, {failed} failed, {skipped} skipped")
    return {"updated": updated, "failed": failed, "skipped": skipped}


if __name__ == "__main__":
    import sys
    
    # Check for command line arguments
    force_update = "--force" in sys.argv or "-f" in sys.argv
    
    if force_update:
        print("Force updating all jobs (re-normalizing all fields)...")
    else:
        print("Updating jobs where municipality, province, or is_remote are null...")
    
    result = update_jobs_data(force_update=force_update)
    
    if result["failed"] > 0:
        exit(1)
    else:
        exit(0)
