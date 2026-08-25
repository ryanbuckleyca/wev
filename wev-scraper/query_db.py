from utils.db import supabase
from datetime import datetime, timezone, timedelta

now = datetime.now(timezone.utc)
cutoff = (now - timedelta(hours=24)).isoformat()

res = supabase.table('jobs').select('id', count='exact').gt('created_at', cutoff).execute()
print(f"Jobs processed in last 24h: {res.count}")

res = supabase.table('organizations').select('id', count='exact').gt('created_at', cutoff).execute()
print(f"Orgs processed in last 24h: {res.count}")
