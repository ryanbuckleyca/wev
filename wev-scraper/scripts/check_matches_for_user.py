#!/usr/bin/env python3
import os
import sys


from utils.db import supabase
from dotenv import load_dotenv, find_dotenv
from supabase import create_client as create_supabase_client


def main():
    if len(sys.argv) < 2:
        print('Usage: check_matches_for_user.py <user-uuid>')
        sys.exit(1)
    uid = sys.argv[1]
    print('Querying job_matches for user:', uid)

    mm = supabase.table('job_matches').select('user_id, job_id, score, value_score, skill_score, work_type_score, location_score, shared_values, shared_skills').eq('user_id', uid).limit(200).execute()
    if getattr(mm, 'error', None):
        print('Error querying job_matches:', mm.error)
    else:
        rows = mm.data or []
        print('rows:', len(rows))
        for m in rows:
            print(m)

    # --- Public client test (simulate browser anon client without session) ---
    try:
        load_dotenv(find_dotenv())
        pub_url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
        pub_key = os.environ.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
        if pub_url and pub_key:
            print('\nTesting public (anon) client access to job_matches for same user...')
            public_client = create_supabase_client(pub_url, pub_key)
            pub_mm = public_client.table('job_matches').select('user_id, job_id, score').eq('user_id', uid).limit(20).execute()
            print('public client error=', getattr(pub_mm, 'error', None))
            print('public client rows=', len(pub_mm.data or []))
        else:
            print('\nPublic client env not found; skipping anon client test')
    except Exception as e:
        print('Public client test failed:', e)


if __name__ == '__main__':
    main()
