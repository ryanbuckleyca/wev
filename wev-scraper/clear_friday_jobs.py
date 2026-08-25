from utils.db import supabase

res = supabase.table('jobs').select('id, scraped_at').execute()
jobs = [r for r in res.data if r.get('scraped_at') and '2026-08-22' in str(r.get('scraped_at'))]

cleared = 0
for job in jobs:
    supabase.table('jobs').update({
        'summary': None,
        'values': [],
        'values_rated': {},
        'is_sse': None,
        'sse_rating': None,
        'sse_details': None
    }).eq('id', job['id']).execute()
    cleared += 1

print(f"Cleared LLM fields for {cleared} jobs from your Friday run (saved as Aug 22 in UTC).")
