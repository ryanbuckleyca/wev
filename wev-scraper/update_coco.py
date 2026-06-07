
from dotenv import load_dotenv

from utils.db import supabase

# Load production env
load_dotenv(".env.production")

resp = supabase.table('sources').select('id,name,url').execute()
for s in resp.data:
    if 'coco' in s['name'].lower() or 'coco' in s['id'].lower():
        print(f"Updating {s['name']} (ID: {s['id']})")
        res = supabase.table('sources').update({'url': 'https://coco-net.org/job-postings/'}).eq('id', s['id']).execute()
        print('Updated successfully:', res.data)
