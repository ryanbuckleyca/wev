#!/usr/bin/env python3
"""Count orgs assessed BEFORE the Gemini 3.x + Tavily upgrade (Aug 5, 2026)."""

import sys
from datetime import datetime, timezone
from pathlib import Path

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

    # Paginate through organizations to avoid loading entire table
    old_orgs = []
    page_size = 1000
    offset = 0
    total_orgs = 0

    print("Fetching organizations in batches...")
    while True:
        response = supabase.table("organizations").select(
            "id, name, sse_details"
        ).order("id").range(offset, offset + page_size - 1).execute()

        # Check for API errors
        if hasattr(response, 'error') and response.error:
            print(f"❌ Database query failed: {response.error}")
            sys.exit(1)

        if not response.data:
            break

        batch_size = len(response.data)
        total_orgs += batch_size
        print(f"  Processed {total_orgs} orgs...")

        for org in response.data:
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
            except (ValueError, AttributeError, TypeError):
                continue

        # Stop if we got fewer results than page size (last page)
        if batch_size < page_size:
            break

        offset += page_size

    print(f"\nFound {len(old_orgs)} orgs assessed with old models (before Gemini 3.x + Tavily)")
    print(f"Total orgs in DB: {total_orgs}")

    if old_orgs:
        print("\nFirst 10 examples:")
        for org in old_orgs[:10]:
            dt_str = org["sse_details"]["classified_at"]
            print(f"  ID {org['id']}: {org['name']} (assessed {dt_str})")

        print("\nLast 10 examples:")
        for org in old_orgs[-10:]:
            dt_str = org["sse_details"]["classified_at"]
            print(f"  ID {org['id']}: {org['name']} (assessed {dt_str})")

        print("\nTo reprocess these, use:")
        print("  cd wev-scraper && ./venv/bin/python3 scripts/backfill_org_websites.py --prod --mode full --overwrite-recent-hours 999999")

if __name__ == "__main__":
    main()
