#!/usr/bin/env python
"""Fix classification for non-SSE organizations in production.

Sets non-SSE orgs to:
- sector_id = NULL
- governance_category = "EXCLUDED"
- governance_subtype = "EXCLUDED_NON_SSE"
"""
import sys
from pathlib import Path

_SCRAPER_DIR = Path(__file__).resolve().parent.parent
if str(_SCRAPER_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRAPER_DIR))

from settings import ensure_env_loaded  # noqa: E402

ensure_env_loaded()

from utils.prod_env import bootstrap_prod_from_argv  # noqa: E402

bootstrap_prod_from_argv(sys.argv, Path(__file__))

from utils.db import supabase  # noqa: E402

print("=" * 70)
print("Fixing classification for non-SSE organizations")
print("=" * 70)
print()
print("This will update non-SSE orgs (is_sse = false or null) to:")
print("  - sector_id = NULL")
print("  - governance_category = 'EXCLUDED'")
print("  - governance_subtype = 'EXCLUDED_NON_SSE'")
print()

# First, count how many need fixing
print("Checking current state...")

# Count non-SSE orgs with sectors
response = supabase.table("organizations")\
    .select("id", count="exact")\
    .not_.is_("sector_id", "null")\
    .or_("is_sse.is.null,is_sse.eq.false")\
    .execute()
with_sectors = response.count or 0

# Count non-SSE orgs without EXCLUDED governance
response = supabase.table("organizations")\
    .select("id", count="exact")\
    .or_("is_sse.is.null,is_sse.eq.false")\
    .not_.eq("governance_category", "EXCLUDED")\
    .execute()
without_excluded_category = response.count or 0

response = supabase.table("organizations")\
    .select("id", count="exact")\
    .or_("is_sse.is.null,is_sse.eq.false")\
    .not_.eq("governance_subtype", "EXCLUDED_NON_SSE")\
    .execute()
without_excluded_subtype = response.count or 0

print("\nNon-SSE orgs that need fixing:")
print(f"  - With sector_id assigned: {with_sectors}")
print(f"  - Without governance_category='EXCLUDED': {without_excluded_category}")
print(f"  - Without governance_subtype='EXCLUDED_NON_SSE': {without_excluded_subtype}")
print()

response = input("Continue with fix? (yes/no): ")
if response.lower() != "yes":
    print("Aborted.")
    sys.exit(0)

print("\nProcessing updates in batches...")

# Update in batches
batch_size = 100
offset = 0
total_updated = 0

while True:
    # Get non-SSE orgs (any that need updating)
    response = supabase.table("organizations")\
        .select("id")\
        .or_("is_sse.is.null,is_sse.eq.false")\
        .range(offset, offset + batch_size - 1)\
        .execute()
    
    if not response.data:
        break
    
    ids = [r['id'] for r in response.data]
    
    if ids:
        # Update all three fields at once
        supabase.table("organizations")\
            .update({
                "sector_id": None,
                "governance_category": "EXCLUDED",
                "governance_subtype": "EXCLUDED_NON_SSE"
            })\
            .in_("id", ids)\
            .execute()
        
        total_updated += len(ids)
        print(f"  Updated {len(ids)} orgs (total: {total_updated})")
    
    if len(response.data) < batch_size:
        break
    
    offset += batch_size

print(f"\n{'='*70}")
print(f"Done! Updated {total_updated} non-SSE organizations.")
print(f"{'='*70}")
print("\nVerifying results...")

# Verify
response = supabase.table("organizations")\
    .select("id", count="exact")\
    .not_.is_("sector_id", "null")\
    .or_("is_sse.is.null,is_sse.eq.false")\
    .execute()
remaining_with_sectors = response.count or 0

response = supabase.table("organizations")\
    .select("id", count="exact")\
    .or_("is_sse.is.null,is_sse.eq.false")\
    .eq("governance_category", "EXCLUDED")\
    .eq("governance_subtype", "EXCLUDED_NON_SSE")\
    .execute()
properly_excluded = response.count or 0

print(f"Non-SSE orgs still with sector_id: {remaining_with_sectors}")
print(f"Non-SSE orgs properly marked EXCLUDED: {properly_excluded}")

if remaining_with_sectors > 0:
    print(f"\n⚠️  Warning: {remaining_with_sectors} non-SSE orgs still have sector_id")
    print("    You may need to run this script again.")
else:
    print("\n✅ All non-SSE organizations properly classified!")
