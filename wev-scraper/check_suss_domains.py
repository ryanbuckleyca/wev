#!/usr/bin/env python3
"""Find organizations with shared platform websites.

By default uses .env (dev/test). Use --prod flag for production data.
"""

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))


def confirm_production():
    """Interactive confirmation for production access."""
    response = input("⚠️  Connect to PRODUCTION database? (yes/no): ")
    return response.lower() in ("yes", "y")


def main():
    parser = argparse.ArgumentParser(description="Find orgs with shared platform websites")
    parser.add_argument(
        "--prod",
        action="store_true",
        help="Use production database (requires confirmation)",
    )
    args = parser.parse_args()

    # Load environment
    if args.prod:
        if not confirm_production():
            print("❌ Production access cancelled")
            sys.exit(1)
        env_file = Path(__file__).parent.parent / ".env.production"
        print("✅ Using PRODUCTION database")
    else:
        env_file = Path(__file__).parent.parent / ".env"
        print("✅ Using development database")

    load_dotenv(env_file)

    from utils.db import supabase  # noqa: E402

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
