#!/usr/bin/env python3
"""Count jobs where compensation_meta IS NULL in the active DB."""
from utils.db import supabase


def main():
    resp = supabase.table('jobs').select('id', count='exact').is_('compensation_meta', 'null').execute()
    # Some Supabase clients return count in resp.count
    count = None
    try:
        count = resp.count
    except Exception:
        pass
    data = resp.data or []
    if count is None:
        count = len(data)
    print(count)

if __name__ == '__main__':
    main()
