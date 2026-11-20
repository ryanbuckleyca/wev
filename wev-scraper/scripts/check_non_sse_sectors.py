#!/usr/bin/env python
"""Check how many non-SSE orgs were assigned sectors in production."""
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

print("Querying production database for organizations with sector assignments...")

# Get all orgs with sectors
all_with_sectors = []
offset = 0
page_size = 1000
while True:
    response = supabase.table("organizations")\
        .select("id, name, sector_id, is_sse")\
        .not_.is_("sector_id", "null")\
        .range(offset, offset + page_size - 1)\
        .execute()
    
    if not response.data:
        break
    
    all_with_sectors.extend(response.data)
    offset += page_size
    
    if len(response.data) < page_size:
        break

total_with_sectors = len(all_with_sectors)
non_sse_with_sectors = [r for r in all_with_sectors if not r.get("is_sse")]

print(f"\n{'='*60}")
print(f"Total orgs with sector assignments: {total_with_sectors}")
print(f"Non-SSE orgs with sector assignments: {len(non_sse_with_sectors)}")
print(f"Percentage: {100 * len(non_sse_with_sectors) / total_with_sectors:.1f}%")
print(f"{'='*60}\n")

if non_sse_with_sectors:
    print("First 15 examples of non-SSE orgs with sectors:")
    for org in non_sse_with_sectors[:15]:
        print(f"  #{org['id']}: {org['name'][:50]} -> {org['sector_id']} (is_sse={org.get('is_sse')})")
    
    # Count by sector
    from collections import Counter
    sector_counts = Counter(org['sector_id'] for org in non_sse_with_sectors)
    print("\nNon-SSE orgs by sector:")
    for sector, count in sector_counts.most_common():
        print(f"  {sector}: {count}")
