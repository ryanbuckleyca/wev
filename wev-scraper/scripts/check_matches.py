#!/usr/bin/env python3
import os
import sys

# Ensure project root is on sys.path so `utils` is importable when running scripts directly
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from utils.db import supabase
from dotenv import load_dotenv
from supabase import create_client as create_supabase_client


def main():
    print('Connected to Supabase. Fetching samples...')
    jobs_resp = supabase.table('jobs').select('id, job_title').limit(5).execute()
    print('jobs count=', len(jobs_resp.data or []))
    for j in (jobs_resp.data or []):
        print('JOB', j['id'], j.get('job_title'))

    profiles_resp = supabase.table('profiles').select('id').limit(5).execute()
    print('profiles count=', len(profiles_resp.data or []))
    for p in (profiles_resp.data or []):
        print('PROFILE', p['id'])

    if profiles_resp.data:
        pid = profiles_resp.data[0]['id']
        print('\nChecking matches for profile id:', pid)
        mm = supabase.table('job_matches').select('user_id, job_id, score, value_score, skill_score, work_type_score, location_score').eq('user_id', pid).limit(10).execute()
        print('matches count=', len(mm.data or []))
        for m in (mm.data or []):
            print(m)

    # Skip exact count query (no single 'id' column); instead sample any NULL scores
    nulls = supabase.table('job_matches').select('user_id, job_id, score').is_('score', None).limit(5).execute()
    print('null score rows sample count=', len(nulls.data or []))
    for n in (nulls.data or []):
        print(n)

    # --- Public client test (simulate browser anon client without session) ---
    try:
        # load frontend env (wev-bulletin) to get PUBLIC URL + key
        load_dotenv(os.path.join(PROJECT_ROOT, '..', 'wev-bulletin', '.env'))
        pub_url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
        pub_key = os.environ.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
        if pub_url and pub_key:
            print('\nTesting public (anon) client access to job_matches for same profile...')
            public_client = create_supabase_client(pub_url, pub_key)
            pub_mm = public_client.table('job_matches').select('user_id, job_id, score').eq('user_id', pid).limit(5).execute()
            print('public client error=', getattr(pub_mm, 'error', None))
            print('public client rows=', len(pub_mm.data or []))
        else:
            print('\nPublic client env not found; skipping anon client test')
    except Exception as e:
        print('Public client test failed:', e)


if __name__ == '__main__':
    main()
