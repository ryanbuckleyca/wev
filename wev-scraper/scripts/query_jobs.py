#!/usr/bin/env python3
"""Query jobs by organization or title and print selected fields.

Usage:
  ./scripts/query_jobs.py --org "Evergreen"
  ./scripts/query_jobs.py --org "Canadian Climate Institute" --limit 20
"""
import argparse
import json

from utils.db import supabase

COLUMNS = (
    "id,organization,job_title,date_posted,wage,unit_text,min_value,max_value,hours_per_week,compensation_meta"
)


def query_by_org(org, limit=20):
    q = supabase.table("jobs").select(COLUMNS).ilike("organization", f"%{org}%").order("date_posted", desc=True).limit(limit)
    resp = q.execute()
    return resp.data or []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--org", action="append", help="Organization name (can repeat)")
    parser.add_argument("--title", action="append", help="Job title fragment (can repeat)")
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()

    results = []
    if args.org:
        for org in args.org:
            rows = query_by_org(org, limit=args.limit)
            results.append({"query": {"org": org}, "rows": rows})
    if args.title:
        for t in args.title:
            q = supabase.table("jobs").select(COLUMNS).ilike("job_title", f"%{t}%").order("date_posted", desc=True).limit(args.limit)
            resp = q.execute()
            rows = resp.data or []
            results.append({"query": {"title": t}, "rows": rows})

    print(json.dumps(results, default=str, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
