#!/usr/bin/env python
"""Clear sector assignments from non-SSE organizations in production."""
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

print("Clearing sector_id for non-SSE organizations...")
print("This will set sector_id=NULL for orgs where is_sse IS NOT TRUE")
print()

response = input("Continue? (yes/no): ")
if response.lower() != "yes":
    print("Aborted.")
    sys.exit(0)

# Update in batches to avoid timeout
batch_size = 100
offset = 0
total_cleared = 0

while True:
    # Get non-SSE orgs with sectors
    response = supabase.table("organizations")\
        .select("id")\
        .not_.is_("sector_id", "null")\
        .or_("is_sse.is.null,is_sse.eq.false")\
        .range(offset, offset + batch_size - 1)\
        .execute()
    
    if not response.data:
        break
    
    ids = [r['id'] for r in response.data]
    
    if ids:
        # Clear sector_id for this batch
        supabase.table("organizations")\
            .update({"sector_id": None})\
            .in_("id", ids)\
            .execute()
        
        total_cleared += len(ids)
        print(f"Cleared {len(ids)} orgs (total: {total_cleared})")
    
    if len(response.data) < batch_size:
        break
    
    offset += batch_size

print(f"\nDone! Cleared sector_id from {total_cleared} non-SSE organizations.")
