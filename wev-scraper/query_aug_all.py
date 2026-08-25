from utils.db import supabase
res_jobs = supabase.table('jobs').select('scraped_at').execute()
aug_jobs = 0
dates = set()
for r in res_jobs.data:
    sa = r.get('scraped_at')
    if sa and '2026-08' in str(sa):
        aug_jobs += 1
        dates.add(str(sa)[:10])
print(f"Total Jobs in Aug 2026: {aug_jobs}")
print(f"Dates found: {dates}")
