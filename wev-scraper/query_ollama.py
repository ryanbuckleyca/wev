import json
from utils.db import supabase

res = supabase.table('jobs').select('id, sse_details').order('scraped_at', desc=True).limit(5000).execute()
count = 0
for r in res.data:
    sse = r.get('sse_details')
    if not sse: continue
    if isinstance(sse, str):
        try: sse = json.loads(sse)
        except: continue
    flags = sse.get('flags', [])
    if any('ollama' in f.lower() for f in flags):
        count += 1
print(f"Jobs with ollama tracking in last 5000: {count}")

res_orgs = supabase.table('organizations').select('id, sse_details').order('id', desc=True).limit(5000).execute()
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
print(f"Orgs with ollama tracking in last 5000: {org_count}")
