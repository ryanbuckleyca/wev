import json
from utils.db import supabase
from datetime import datetime, timezone, timedelta

try:
    res = supabase.table('jobs').select('id').limit(1).execute()
    print("Schema test successful. Does created_at exist?")
except Exception as e:
    print(e)
