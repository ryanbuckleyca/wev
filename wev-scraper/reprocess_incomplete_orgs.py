#!/usr/bin/env python3
"""Re-process incomplete organizations, skipping recently processed ones."""

import sys
import time
from datetime import datetime, timedelta

from llm.tavily_grounding import is_tavily_available
from utils.db import supabase
from utils.organization_assessment import OrganizationAssessor, _result_to_db_fields


def main():
    # Check Tavily availability upfront
    if not is_tavily_available():
        print("=" * 80)
        print("ERROR: TAVILY NOT AVAILABLE")
        print("=" * 80)
        print("\nTavily grounding is required for accurate organization assessment.")
        print("Please check:")
        print("  • TAVILY_API_KEY is set in environment")
        print("  • Tavily quota is not exhausted")
        print("\nAborting to avoid processing with degraded quality.")
        sys.exit(1)

    assessor = OrganizationAssessor()

    print("=" * 80)
    print("RE-PROCESSING INCOMPLETE ORGANIZATIONS")
    print("=" * 80)

    # Fetch all organizations
    all_orgs = []
    offset = 0
    page_size = 1000

    print("\nFetching organizations from database...")
    try:
        while True:
            response = supabase.table('organizations').select('*').range(offset, offset + page_size - 1).execute()
            if not response.data:
                break
            all_orgs.extend(response.data)
            if len(response.data) < page_size:
                break
            offset += page_size
    except Exception as e:
        print(f"❌ Failed to fetch organizations from database: {e}")
        sys.exit(1)

    print(f"Total organizations: {len(all_orgs)}")

    # Filter to incomplete orgs (missing critical fields)
    incomplete_orgs = []
    for org in all_orgs:
        missing_critical = []
        if not org.get('sector_id'):
            missing_critical.append('sector_id')
        if not org.get('type'):
            missing_critical.append('type')
        if not org.get('description_en'):
            missing_critical.append('description_en')
        if not org.get('description_fr'):
            missing_critical.append('description_fr')

        if missing_critical:
            incomplete_orgs.append((org, missing_critical))

    print(f"\nIncomplete organizations: {len(incomplete_orgs)}")

    if not incomplete_orgs:
        print("\n✅ All organizations are complete!")
        return

    # Show what's missing
    print("\nMissing field breakdown:")
    missing_stats = {}
    for _org, missing in incomplete_orgs:
        for field in missing:
            missing_stats[field] = missing_stats.get(field, 0) + 1

    for field, count in sorted(missing_stats.items()):
        print(f"  {field}: {count}")

    # Filter out recently processed orgs (processed in last 24 hours)
    cutoff_time = datetime.utcnow() - timedelta(hours=24)
    orgs_to_process = []
    orgs_skipped_recent = []

    for org, missing in incomplete_orgs:
        updated_at = org.get('updated_at')
        if updated_at:
            try:
                # Parse ISO timestamp
                updated_dt = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
                if updated_dt.replace(tzinfo=None) > cutoff_time:
                    orgs_skipped_recent.append(org['name'])
                    continue
            except (ValueError, AttributeError):
                pass  # If parsing fails, include in processing

        orgs_to_process.append((org, missing))

    print(f"\nOrganizations updated in last 24h (will skip): {len(orgs_skipped_recent)}")
    if orgs_skipped_recent:
        print("Skipping (recently processed):")
        for name in orgs_skipped_recent[:10]:
            print(f"  • {name}")
        if len(orgs_skipped_recent) > 10:
            print(f"  ... and {len(orgs_skipped_recent) - 10} more")

    print(f"\nOrganizations to re-process: {len(orgs_to_process)}")

    if not orgs_to_process:
        print("\n✅ Nothing to process (all incomplete orgs were recently updated)")
        return

    # Show which ones we'll process
    print("\nWill process:")
    for org, missing in orgs_to_process[:10]:
        print(f"  • {org.get('name')} (missing: {', '.join(missing)})")
    if len(orgs_to_process) > 10:
        print(f"  ... and {len(orgs_to_process) - 10} more")

    confirm = input(f"\n⚠️  Re-process {len(orgs_to_process)} organizations? (yes/no): ")
    if confirm.lower() != 'yes':
        print("Cancelled.")
        return

    print("\nProcessing organizations...")
    success_count = 0
    error_count = 0
    no_change_count = 0

    for i, (org, missing) in enumerate(orgs_to_process, 1):
        org_id = org['id']
        name = org.get('name', '(unnamed)')
        municipality = org.get('municipality')
        province = org.get('province')
        website = org.get('website')

        print(f"\n[{i}/{len(orgs_to_process)}] Processing: {name}")
        print(f"  Location: {municipality}, {province}")
        print(f"  Missing: {', '.join(missing)}")

        existing_description = org.get('description_en') or org.get('description')

        try:
            result = assessor.assess(
                raw_name=name,
                municipality=municipality,
                province=province,
                job_title="",
                description="",
                known_website=website,
                existing_description=existing_description,
            )

            if result:
                update_fields = _result_to_db_fields(result)

                # Only update fields that are currently missing
                filtered_update = {}
                for field, value in update_fields.items():
                    if not org.get(field) and value:
                        filtered_update[field] = value

                if filtered_update:
                    response = supabase.table('organizations').update(filtered_update).eq('id', org_id).execute()
                    print(f"  ✅ Updated fields: {', '.join(filtered_update.keys())}")
                    success_count += 1
                else:
                    print("  ⚠️  No new fields to update")
                    no_change_count += 1
            else:
                print("  ❌ Assessment failed")
                error_count += 1

        except Exception as e:
            print(f"  ❌ Error: {e}")
            error_count += 1

        # Small delay to avoid rate limiting
        time.sleep(0.5)

    print("\n" + "=" * 80)
    print("RE-PROCESSING COMPLETE")
    print("=" * 80)
    print(f"Successfully updated: {success_count}")
    print(f"No changes needed: {no_change_count}")
    print(f"Failed: {error_count}")
    print(f"Total processed: {len(orgs_to_process)}")

if __name__ == '__main__':
    main()
