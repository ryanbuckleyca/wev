"""Seed a source into the database (local or prod)."""

import argparse
import sys
from pathlib import Path

from settings import ensure_env_loaded


def seed_source(slug: str, name: str, url: str, prod: bool = False):
    if prod:
        from utils.prod_env import apply_prod_overrides, confirm_prod_run, resolve_prod_env_path
        script_dir = Path(__file__).resolve().parent
        prod_env = resolve_prod_env_path(script_dir / "scrape.py")
        if not prod_env.exists():
            print(f"❌ {prod_env} not found — required for prod seeding.")
            sys.exit(1)
        apply_prod_overrides(prod_env, full_prod=True)
        confirm_prod_run(full_prod=True)
    else:
        ensure_env_loaded()

    from utils.db import supabase

    resp = supabase.table("sources").select("*").eq("slug", slug).execute()
    if resp.data:
        print(f"{slug} already exists: {resp.data}")
        sys.exit(0)

    print(f"Inserting {slug} source...")
    insert_resp = supabase.table("sources").insert({
        "name": name,
        "slug": slug,
        "url": url,
    }).execute()

    if insert_resp.data:
        row = insert_resp.data[0]
        print(f"✅ Inserted! ID: {row['id']}")
        if prod:
            print("\nAdd this to PROD_SOURCE_CANONICAL_SLUG in registry.py:")
            print(f'    "{row["id"]}": "{slug}",')
    else:
        print("❌ Insert failed:", insert_resp)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed a source into the database")
    parser.add_argument("--slug", required=True, help="Source slug (e.g. charityvillage)")
    parser.add_argument("--name", required=True, help="Display name (e.g. CharityVillage)")
    parser.add_argument("--url", required=True, help="Source URL (e.g. https://www.charityvillage.com)")
    parser.add_argument("--prod", action="store_true", help="Seed into production")
    args = parser.parse_args()
    seed_source(args.slug, args.name, args.url, args.prod)
