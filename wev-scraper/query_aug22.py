from utils.db import supabase
res_jobs = supabase.table('jobs').select('scraped_at').execute()
aug22_jobs = 0
for r in res_jobs.data:
    sa = r.get('scraped_at')
    if sa and '2026-08-22' in str(sa):
        aug22_jobs += 1
print(f"Total Jobs on Aug 22 (UTC): {aug22_jobs}")
