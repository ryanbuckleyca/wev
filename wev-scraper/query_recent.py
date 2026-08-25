import json
from utils.db import supabase
from datetime import datetime, timezone, timedelta

now = datetime.now(timezone.utc)
cutoff = (now - timedelta(hours=24)).isoformat()
# `scraped_at` is the only timestamp we have for jobs, let's see how many were scraped today
res = supabase.table('jobs').select('id', count='exact').gt('scraped_at', cutoff).execute()
print(f"Jobs scraped in last 24h: {res.count}")
