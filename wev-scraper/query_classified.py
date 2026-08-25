import json
from utils.db import supabase
from datetime import datetime, timezone, timedelta

now = datetime.now(timezone.utc)
cutoff = (now - timedelta(hours=24)).isoformat()

res = supabase.table('jobs').select('id, sse_details').not_.is_('sse_details', 'null').limit(5000).execute()
count = 0
for r in res.data:
    sse = r.get('sse_details')
    if not sse: continue
    if isinstance(sse, str):
        try: sse = json.loads(sse)
        except: continue
    classified_at = sse.get('classified_at')
    if classified_at and classified_at > cutoff:
        count += 1
print(f"Jobs classified in the last 24h: {count}")
