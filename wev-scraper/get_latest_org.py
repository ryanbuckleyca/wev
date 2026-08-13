#!/usr/bin/env python3
"""Get the latest organization from the database.

By default uses .env (dev/test). Use --prod flag for production data.
"""

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))


def confirm_production():
    """Interactive confirmation for production access."""
    try:
        response = input("⚠️  Connect to PRODUCTION database? (yes/no): ")
        return response.lower() in ("yes", "y")
    except EOFError:
        # Non-interactive environment or interrupted input
        print("\n❌ Non-interactive environment detected. Production access denied.")
        return False


def main():
    parser = argparse.ArgumentParser(description="Get latest organization from database")
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

    response = supabase.table("organizations").select("id, name, created_at").order("id", desc=True).limit(1).execute()

    # Check for API errors
    if hasattr(response, 'error') and response.error:
        print(f"❌ Database query failed: {response.error}")
        sys.exit(1)

    if response.data:
        org = response.data[0]
        print(f"Latest org ID: {org['id']}")
        print(f"Name: {org['name']}")
        print(f"Created: {org['created_at']}")
    else:
        print("No organizations found")


if __name__ == "__main__":
    main()
