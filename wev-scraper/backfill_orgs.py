#!/usr/bin/env python3
"""Backfill incomplete organization fields."""

import argparse
import sys
import time

from llm.tavily_grounding import is_tavily_available
from utils.catch_up import SKIP_REASON_EXCEPTION, _park_org, persist_org_assessment_outcome
from utils.db import supabase
from utils.organization_assessment import OrganizationAssessor


def _parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Backfill incomplete organization fields.",
    )
    parser.add_argument(
        "--include-parked",
        action="store_true",
        help=(
            "Also process organizations parked with an assessment_skip_reason. "
            "By default parked rows are skipped."
        ),
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = _parse_args(argv)
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
    print("BACKFILLING INCOMPLETE ORGANIZATION FIELDS")
    print("=" * 80)

    # Find organizations that need backfilling
    # Missing: sector_id, type, description_en, description_fr, or mission_statement_en

    all_orgs = []
    last_id = 0
    page_size = 1000

    print("\nFetching organizations from database...")
    try:
        while True:
            response = supabase.table('organizations').select('*').gt('id', last_id).order('id').limit(page_size).execute()
            if not response.data:
                break
            all_orgs.extend(response.data)
            if len(response.data) < page_size:
                break
            last_id = response.data[-1]['id']
    except Exception as e:
        print(f"❌ Failed to fetch organizations from database: {e}")
        sys.exit(1)

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
        # Only include orgs missing critical fields, not just mission.
        if missing_critical and (
            args.include_parked or org.get("assessment_skip_reason") is None
        ):
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
            outcome = assessor.assess_with_outcome(
                raw_name=name,
                municipality=municipality,
                province=province,
                job_title="",  # No job context for org backfill
                description="",
                known_website=website,
                existing_description=existing_description,
            )

            write = persist_org_assessment_outcome(org, outcome)
            filtered_update = write.filtered
            reason = write.reason

            if not write.applied:
                print("  ⚠️  Conflict: row was modified since we read it, skipping")
                error_count += 1
            elif reason is None:
                print(f"  ✅ Updated fields: {', '.join(filtered_update.keys())}")
                success_count += 1
            else:
                if filtered_update:
                    print(f"  ✅ Updated fields: {', '.join(filtered_update.keys())}")
                print(f"  ⏸  Parked for review: {reason}")
                if outcome.result is None:
                    error_count += 1

        except Exception as e:
            print(f"  ❌ Error: {e}")
            error_count += 1
            _park_org(org, SKIP_REASON_EXCEPTION)

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
