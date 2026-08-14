#!/usr/bin/env python3
"""Check organization processing status in production database."""
from supabase import create_client

SUPABASE_URL = "https://teuvfoftdjfsnkkbnzps.supabase.co"
SUPABASE_KEY = "***REMOVED_SUPABASE_PROD_SERVICE_ROLE_KEY***"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("=" * 80)
print("ORGANIZATION PROCESSING STATUS (PRODUCTION)")
print("=" * 80)

# Fetch all orgs (paginated)
all_orgs = []
page_size = 1000
offset = 0

while True:
    response = supabase.table('organizations').select('*').range(offset, offset + page_size - 1).execute()
    if not response.data:
        break
    all_orgs.extend(response.data)
    if len(response.data) < page_size:
        break
    offset += page_size

total = len(all_orgs)
with_sector = sum(1 for org in all_orgs if org.get('sector_id'))
without_sector = total - with_sector

print(f"\nTotal Organizations: {total}")
print(f"Organizations with sector: {with_sector}")
print(f"Organizations without sector: {without_sector}")
print(f"Completion rate: {round(with_sector / total * 100, 2) if total > 0 else 0}%")

# Check model usage
print("\n" + "=" * 80)
print("MODEL USAGE (from flags)")
print("=" * 80)

model_counts = {}
total_with_model = 0

for org in all_orgs:
    flags = org.get('flags', [])
    if flags:
        for flag in flags:
            if isinstance(flag, str) and flag.startswith('model:'):
                model_counts[flag] = model_counts.get(flag, 0) + 1
                total_with_model += 1
                break

print(f"\nOrganizations with model flag: {total_with_model} / {total}")
if model_counts:
    print("\nModel breakdown:")
    for model, count in sorted(model_counts.items(), key=lambda x: x[1], reverse=True):
        pct = round(count / total * 100, 2) if total > 0 else 0
        print(f"  {model}: {count} ({pct}%)")
else:
    print("  No model flags found")

# Completeness metrics
print("\n" + "=" * 80)
print("FIELD COMPLETENESS")
print("=" * 80)

fields = {
    'sector_id': sum(1 for org in all_orgs if org.get('sector_id')),
    'type': sum(1 for org in all_orgs if org.get('type')),
    'description_en': sum(1 for org in all_orgs if org.get('description_en')),
    'description_fr': sum(1 for org in all_orgs if org.get('description_fr')),
    'mission_statement_en': sum(1 for org in all_orgs if org.get('mission_statement_en')),
    'sse_rating (not "no")': sum(1 for org in all_orgs if org.get('sse_rating') and org.get('sse_rating') != 'no'),
}

for field, count in fields.items():
    pct = round(count / total * 100, 2) if total > 0 else 0
    print(f"  {field}: {count}/{total} ({pct}%)")

# Sample without sector
print("\n" + "=" * 80)
print("SAMPLE: Organizations without sector_id (first 10)")
print("=" * 80)

without_sector_orgs = [org for org in all_orgs if not org.get('sector_id')][:10]

if without_sector_orgs:
    for org in without_sector_orgs:
        name = org.get('canonical_name') or org.get('name') or '(unnamed)'
        print(f"\n  • {name}")
        print(f"    Type: {org.get('type', 'null')}")
        flags = org.get('flags', [])
        if flags:
            print(f"    Flags: {', '.join(str(f) for f in flags[:3])}")
else:
    print("  (All organizations have sector_id!)")

print("\n" + "=" * 80)
