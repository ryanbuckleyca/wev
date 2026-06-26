"""Seed CharityVillage source into the production database."""

import sys
from pathlib import Path

from settings import load_env_file
from utils.prod_env import resolve_prod_env_path, apply_prod_overrides, confirm_prod_run

# Load base .env first, then prod overrides
script_dir = Path(__file__).resolve().parent
root_dir = script_dir.parent
base_env = root_dir / ".env" if (root_dir / ".env").exists() else script_dir / ".env"
if base_env.exists():
    load_env_file(base_env)

prod_env = resolve_prod_env_path(script_dir / "scrape.py")
if not prod_env.exists():
    print(f"❌ {prod_env} not found — required for prod seeding.")
    sys.exit(1)

apply_prod_overrides(prod_env, full_prod=True)
confirm_prod_run(full_prod=True)

# Now import supabase (after env is configured)
from utils.db import supabase

resp = supabase.table("sources").select("*").eq("slug", "charityvillage").execute()
if resp.data:
    print("CharityVillage already exists in prod:", resp.data)
    sys.exit(0)

print("Inserting CharityVillage source into prod...")
insert_resp = supabase.table("sources").insert({
    "name": "CharityVillage",
    "slug": "charityvillage",
    "url": "https://www.charityvillage.com",
}).execute()

if insert_resp.data:
    row = insert_resp.data[0]
    print(f"✅ Inserted! ID: {row['id']}")
    print(f"\nAdd this to PROD_SOURCE_CANONICAL_SLUG in registry.py:")
    print(f'    "{row["id"]}": "charityvillage",')
else:
    print("❌ Insert failed:", insert_resp)
