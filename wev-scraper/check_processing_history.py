#!/usr/bin/env python3
"""Check which organizations were processed with new models/Tavily vs old models."""

from utils.db import supabase
from datetime import datetime, timedelta
import json

def main():
    print("=" * 80)
    print("ORGANIZATION PROCESSING HISTORY")
    print("=" * 80)

    # Fetch all organizations
    all_orgs = []
    offset = 0
    page_size = 1000

    while True:
        response = supabase.table('organizations').select('*').range(offset, offset + page_size - 1).execute()
        if not response.data:
            break
        all_orgs.extend(response.data)
        if len(response.data) < page_size:
            break
        offset += page_size

    print(f"\nTotal Organizations: {len(all_orgs)}")

    # Analyze model usage from sse_details.flags
    with_model_flag = 0
    model_counts = {}

    for org in all_orgs:
        sse_details = org.get('sse_details')
        if sse_details:
            try:
                if isinstance(sse_details, str):
                    details = json.loads(sse_details)
                else:
                    details = sse_details

                flags = details.get('flags', [])
                if flags:
                    for flag in flags:
                        if flag.startswith('model:'):
                            with_model_flag += 1
                            model = flag.replace('model:', '')
                            model_counts[model] = model_counts.get(model, 0) + 1
                            break  # Only count once per org
            except:
                pass

    print("\n" + "=" * 80)
    print("MODEL TRACKING")
    print("=" * 80)
    print(f"\nOrganizations with model flag: {with_model_flag}/{len(all_orgs)} ({with_model_flag/len(all_orgs)*100:.1f}%)")

    if model_counts:
        print("\nModel breakdown:")
        for model, count in sorted(model_counts.items(), key=lambda x: x[1], reverse=True):
            print(f"  {model}: {count}")
    else:
        print("\n⚠️  No model flags found in any organization")
        print("This suggests the model tracking feature was added recently")

    # Analyze update timestamps
    now = datetime.utcnow()

    last_24h = 0
    last_week = 0
    last_month = 0
    older = 0
    no_timestamp = 0

    for org in all_orgs:
        updated_at = org.get('updated_at')
        if not updated_at:
            no_timestamp += 1
            continue

        try:
            updated_dt = datetime.fromisoformat(updated_at.replace('Z', '+00:00')).replace(tzinfo=None)
            age = now - updated_dt

            if age < timedelta(hours=24):
                last_24h += 1
            elif age < timedelta(days=7):
                last_week += 1
            elif age < timedelta(days=30):
                last_month += 1
            else:
                older += 1
        except:
            no_timestamp += 1

    print("\n" + "=" * 80)
    print("UPDATE TIMESTAMPS")
    print("=" * 80)
    print(f"\nUpdated in last 24 hours: {last_24h} ({last_24h/len(all_orgs)*100:.1f}%)")
    print(f"Updated in last week: {last_week} ({last_week/len(all_orgs)*100:.1f}%)")
    print(f"Updated in last month: {last_month} ({last_month/len(all_orgs)*100:.1f}%)")
    print(f"Updated >1 month ago: {older} ({older/len(all_orgs)*100:.1f}%)")
    print(f"No timestamp: {no_timestamp}")

    # Check incomplete organizations
    incomplete = []
    for org in all_orgs:
        missing = []
        if not org.get('description_en'):
            missing.append('description_en')
        if not org.get('description_fr'):
            missing.append('description_fr')
        if missing:
            incomplete.append((org.get('name'), missing, org.get('website'), org.get('updated_at')))

    print("\n" + "=" * 80)
    print("INCOMPLETE ORGANIZATIONS")
    print("=" * 80)
    print(f"\nOrganizations missing critical fields: {len(incomplete)}")

    if incomplete:
        print("\nDetails:")
        for name, missing, website, updated_at in incomplete:
            print(f"\n  • {name}")
            print(f"    Missing: {', '.join(missing)}")
            print(f"    Website: {website}")
            if updated_at:
                try:
                    updated_dt = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
                    print(f"    Last updated: {updated_dt.strftime('%Y-%m-%d %H:%M UTC')}")
                except:
                    print(f"    Last updated: {updated_at}")

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"\n✅ Critical field completion: {(len(all_orgs) - len(incomplete))/len(all_orgs)*100:.2f}%")
    print(f"⚠️  Organizations needing attention: {len(incomplete)}")

    if with_model_flag == 0:
        print(f"\n⚠️  Model tracking: Not available")
        print(f"   Model flags were likely added after most orgs were processed")
        print(f"   {last_24h} orgs updated in last 24h may have model tracking")
    else:
        print(f"\n📊 Model tracking: {with_model_flag} orgs ({with_model_flag/len(all_orgs)*100:.1f}%)")
        print(f"   This suggests ~{len(all_orgs) - with_model_flag} orgs were processed before tracking was added")

if __name__ == '__main__':
    main()
