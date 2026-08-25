from utils.db import supabase
res = supabase.table('jobs').select('*').limit(1).execute()
if res.data:
    print(res.data[0].keys())
