import json
from utils.db import supabase
from datetime import datetime, timezone

# Let's just find ANY ollama in the entire jobs and orgs table
res_orgs = supabase.table('organizations').select('id, sse_details').execute()
org_count = 0
for r in res_orgs.data:
    sse = r.get('sse_details')
    if not sse: continue
    if isinstance(sse, str):
        try: sse = json.loads(sse)
        except: continue
    flags = sse.get('flags', [])
    if any('ollama' in f.lower() for f in flags):
        org_count += 1
print(f"Total Orgs with ollama tracking in DB: {org_count}")

# Jobs don't track the model provider in sse_details. So we find jobs processed on Aug 21
# Jobs has scraped_at. We also look for classified_at in sse_details
res_jobs = supabase.table('jobs').select('id, sse_details, scraped_at').execute()
jobs_aug21 = 0
jobs_ollama = 0
for r in res_jobs.data:
    sse = r.get('sse_details')
    classified_at = None
    if sse:
        if isinstance(sse, str):
            try: sse = json.loads(sse)
            except: pass
        if isinstance(sse, dict):
            classified_at = sse.get('classified_at')
            flags = sse.get('flags', [])
            if any('ollama' in f.lower() for f in flags):
                jobs_ollama += 1
    
    # Check if classified_at or scraped_at is Aug 21
    is_aug21 = False
    if classified_at and '2026-08-21' in classified_at:
        is_aug21 = True
    elif r.get('scraped_at') and '2026-08-21' in str(r.get('scraped_at')):
        is_aug21 = True
        
    if is_aug21:
        jobs_aug21 += 1

print(f"Total Jobs with ollama tracking in DB: {jobs_ollama}")
print(f"Total Jobs processed/scraped on Aug 21: {jobs_aug21}")
