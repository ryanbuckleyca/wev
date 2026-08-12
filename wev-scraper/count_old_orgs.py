#!/usr/bin/env python3
"""Count orgs assessed BEFORE the Gemini 3.x + Tavily upgrade (Aug 5, 2026)."""

import sys
from pathlib import Path
from datetime import datetime, timezone

from utils.prod_env import bootstrap_prod_from_argv, confirm_prod_run

if "--prod" in sys.argv[1:]:
    confirm_prod_run(full_prod=True)
    bootstrap_prod_from_argv(sys.argv[1:], Path(__file__))
    print("Using PRODUCTION database")
else:
    print("Using TEST database")

from utils.db import supabase

# Gemini 3.x + Tavily was deployed on Aug 5, 2026 at 18:07 EST
CUTOFF_DATE = datetime(2026, 8, 5, 22, 7, tzinfo=timezone.utc)  # 18:07 EST = 22:07 UTC

def main():
    print(f"Finding orgs assessed before {CUTOFF_DATE.isoformat()}")

    # Query for orgs with classified_at before cutoff
    response = supabase.table("organizations").select(
        "id, name, sse_details"
    ).order("id").execute()

    old_orgs = []
    for org in response.data or []:
        details = org.get("sse_details")
        if not isinstance(details, dict):
            continue

        classified_at = details.get("classified_at")
        if not classified_at:
            continue

        try:
            dt = datetime.fromisoformat(classified_at.replace("Z", "+00:00"))
            if dt < CUTOFF_DATE:
                old_orgs.append(org)
        except:
            continue

    print(f"\nFound {len(old_orgs)} orgs assessed with old models (before Gemini 3.x + Tavily)")
    print(f"Total orgs in DB: {len(response.data or [])}")

    if old_orgs:
        print(f"\nFirst 10 examples:")
        for org in old_orgs[:10]:
            dt_str = org["sse_details"]["classified_at"]
            print(f"  ID {org['id']}: {org['name']} (assessed {dt_str})")

        print(f"\nLast 10 examples:")
        for org in old_orgs[-10:]:
            dt_str = org["sse_details"]["classified_at"]
            print(f"  ID {org['id']}: {org['name']} (assessed {dt_str})")

        print(f"\nTo reprocess these, use:")
        print(f"  cd wev-scraper && ./venv/bin/python3 scripts/backfill_org_websites.py --prod --mode full --overwrite-recent-hours 999999")

if __name__ == "__main__":
    main()
