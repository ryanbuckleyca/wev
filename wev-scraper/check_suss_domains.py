#!/usr/bin/env python3
"""Find organizations with shared platform websites."""

import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))

load_dotenv(Path(__file__).parent.parent / ".env.production")

from utils.db import supabase  # noqa: E402


def main():
    response = supabase.table("organizations").select(
        "id, name, website, location, created_at"
    ).or_(
        "website.ilike.%facebook.com%,"
        "website.ilike.%linkedin.com%,"
        "website.ilike.%instagram.com%,"
        "website.ilike.%panierdachat.app%,"
        "website.ilike.%wixsite.com%,"
        "website.ilike.%squarespace.com%,"
        "website.ilike.%etsy.com%,"
        "website.ilike.%greenhouse.io%"
    ).not_.is_("website", "null").order("created_at", desc=True).limit(50).execute()

    print(f"\nFound {len(response.data)} organizations with shared platform websites\n")

    for row in response.data:
        print(f"ID: {row['id']}")
        print(f"  Name: {row['name']}")
        print(f"  Website: {row['website']}")
        print(f"  Location: {row['location'] or 'N/A'}")
        print()

    if response.data:
        ids = [str(row['id']) for row in response.data]
        print(f"Org IDs: {','.join(ids)}")

if __name__ == "__main__":
    main()
