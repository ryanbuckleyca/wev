#!/usr/bin/env python3
"""Backfill incomplete organization fields."""

import sys
import time

from llm.tavily_grounding import is_tavily_available
from utils.db import supabase
from utils.organization_assessment import OrganizationAssessor, _result_to_db_fields


def main():
    # Check Tavily availability upfront
    if not is_tavily_available():
        print("=" * 80)
        print("WARNING: TAVILY NOT AVAILABLE")
        print("=" * 80)
        print("\nTavily grounding is recommended for accurate organization assessment.")
        print("Processing will continue but may produce lower quality results.")
        print("Check:")
        print("  • TAVILY_API_KEY is set in environment")
        print("  • Tavily quota is not exhausted")

        confirm = input("\nContinue without Tavily? (yes/no): ")
        if confirm.lower() != 'yes':
            print("Aborted.")
            sys.exit(1)
        print("\nContinuing without Tavily grounding...")

    assessor = OrganizationAssessor()

    print("=" * 80)
    print("BACKFILLING INCOMPLETE ORGANIZATION FIELDS")
    print("=" * 80)

    # Find organizations that need backfilling
    # Missing: sector_id, type, description_en, description_fr, or mission_statement_en

    all_orgs = []
    offset = 0
    page_size = 1000

    print("\nFetching organizations from database...")
    while True:
        response = supabase.table('organizations').select('*').range(offset, offset + page_size - 1).execute()
        if not response.data:
            break
        all_orgs.extend(response.data)
        if len(response.data) < page_size:
            break
        offset += page_size

    print(f"Total organizations: {len(all_orgs)}")

    # Filter to incomplete orgs
    incomplete_orgs = []
    for org in all_orgs:
        # Check which critical fields are missing
        missing_critical = []
        if not org.get('sector_id'):
            missing_critical.append('sector_id')
        if not org.get('type'):
            missing_critical.append('type')
        if not org.get('description_en'):
            missing_critical.append('description_en')
        if not org.get('description_fr'):
            missing_critical.append('description_fr')

        # Mission statement is optional (many orgs don't publish one)
        # Only include orgs missing critical fields, not just mission
        if missing_critical:
            incomplete_orgs.append(org)

    print(f"Incomplete organizations: {len(incomplete_orgs)}")

    if not incomplete_orgs:
        print("\n✅ All organizations are complete!")
        return

    # Show what's missing
    missing_stats = {
        'sector_id': 0,
        'type': 0,
        'description_en': 0,
        'description_fr': 0,
    }

    for org in incomplete_orgs:
        for field in missing_stats.keys():
            if not org.get(field):
                missing_stats[field] += 1

    print("\nMissing field counts:")
    for field, count in missing_stats.items():
        print(f"  {field}: {count}")

    confirm = input(f"\n⚠️  Process {len(incomplete_orgs)} organizations? (yes/no): ")
    if confirm.lower() != 'yes':
        print("Cancelled.")
        return

    print("\nProcessing organizations...")
    success_count = 0
    error_count = 0

    for i, org in enumerate(incomplete_orgs, 1):
        org_id = org['id']
        name = org.get('name', '(unnamed)')
        municipality = org.get('municipality')
        province = org.get('province')
        website = org.get('website')

        print(f"\n[{i}/{len(incomplete_orgs)}] Processing: {name}")
        print(f"  Municipality: {municipality}, Province: {province}")

        # Get existing values to pass as context
        existing_description = org.get('description_en') or org.get('description')

        try:
            # Re-assess the organization WITH TAVILY GROUNDING
            # If Tavily is unavailable, this will use grounding but fall back gracefully
            # For critical backfill operations, consider using web_evidence with required=True
            result = assessor.assess(
                raw_name=name,
                municipality=municipality,
                province=province,
                job_title="",  # No job context for org backfill
                description="",
                known_website=website,
                existing_description=existing_description,
            )

            if result:
                # Build update payload
                update_fields = _result_to_db_fields(result)

                # Only update fields that are currently missing
                filtered_update = {}
                for field, value in update_fields.items():
                    if not org.get(field) and value:
                        filtered_update[field] = value

                if filtered_update:
                    # Update in database
                    response = supabase.table('organizations').update(filtered_update).eq('id', org_id).execute()

                    print(f"  ✅ Updated fields: {', '.join(filtered_update.keys())}")
                    success_count += 1
                else:
                    print("  ⚠️  No new fields to update")
            else:
                print("  ❌ Assessment failed")
                error_count += 1

        except Exception as e:
            print(f"  ❌ Error: {e}")
            error_count += 1

        # Rate limiting
        time.sleep(0.5)

    print("\n" + "=" * 80)
    print("BACKFILL COMPLETE")
    print("=" * 80)
    print(f"Successfully processed: {success_count}")
    print(f"Errors: {error_count}")
    print(f"Total: {len(incomplete_orgs)}")

if __name__ == '__main__':
    main()
