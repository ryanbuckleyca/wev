#!/usr/bin/env python3
"""Retry organizations that previously failed assessment validation."""

import sys
import time

from llm.tavily_grounding import is_tavily_available
from utils.catch_up import SKIP_REASON_EXCEPTION, _park_org, persist_org_assessment_outcome
from utils.db import supabase
from utils.organization_assessment import OrganizationAssessor

# List of org names that failed validation
FAILED_ORGS = [
    # Original failures
    "The Canadian Academy of Recording Arts and Sciences",
    "Michael Arnowitt, pianist – Crescendo Productions",
    "Carrefour d'aide aux nouveaux arrivants",
    "KW Habilitation – Our Farm",
    "Regroup'elles",
    "MSRK Lifecare Foundation",
    "Le PAS de la rue",
    "Le Centre de ressources et d'action communautaire de la Petite-Patrie",
    "Projet inclusion",
    "SEIZE",
    "Joyfully Organic Farm",
    "Slow Train Farm",
    "FP Inc.",
    # Additional recent failures
    "Northern Lights School of Dance",
    "Le Carrefour Jeunesse-Emploi Centre-Nord",
    # Latest failures (from current run)
    "Méta d'Âme",
    "General Dynamics Corporation",
    "Bâtiment 7 – 7 À Nous",
    "Maison des jeunes Carrefour Jeunesse de Sainte-Rose",
    "L'Alternative, centre de jour en santé mentale",
    "Service de remplacement éducatif à la petite enfance",
    # NOTE: "Private residence" entries are now automatically rejected and won't be retried
]

def main():
    # Check Tavily availability upfront
    if not is_tavily_available():
        print("=" * 80)
        print("ERROR: TAVILY NOT AVAILABLE")
        print("=" * 80)
        print("\nTavily grounding is REQUIRED for retrying failed validations.")
        print("These organizations failed specifically because of domain/location mismatches.")
        print("Without Tavily, they will fail again.")
        print("\nPlease check:")
        print("  • TAVILY_API_KEY is set in environment")
        print("  • Tavily quota is not exhausted")
        print("\nAborting.")
        sys.exit(1)

    assessor = OrganizationAssessor()

    print("=" * 80)
    print("RETRYING FAILED ORGANIZATION ASSESSMENTS")
    print("=" * 80)

    # Fetch these specific orgs from database
    orgs_to_retry = []
    for name in FAILED_ORGS:
        response = supabase.table('organizations').select('*').eq('name', name).execute()
        if response.data:
            orgs_to_retry.extend(response.data)
        else:
            print(f"⚠️  Could not find: {name}")

    print(f"\nFound {len(orgs_to_retry)} organizations to retry")

    if not orgs_to_retry:
        print("No organizations to process.")
        return

    confirm = input(f"\nRetry {len(orgs_to_retry)} failed organizations? (yes/no): ")
    if confirm.lower() != 'yes':
        print("Cancelled.")
        return

    print("\nProcessing organizations...")
    success_count = 0
    still_failed_count = 0

    for i, org in enumerate(orgs_to_retry, 1):
        org_id = org['id']
        name = org.get('name', '(unnamed)')
        municipality = org.get('municipality')
        province = org.get('province')
        website = org.get('website')

        print(f"\n[{i}/{len(orgs_to_retry)}] Processing: {name}")
        print(f"  Municipality: {municipality}, Province: {province}")

        existing_description = org.get('description_en') or org.get('description')

        try:
            outcome = assessor.assess_with_outcome(
                raw_name=name,
                municipality=municipality,
                province=province,
                job_title="",
                description="",
                known_website=website,
                existing_description=existing_description,
            )

            write = persist_org_assessment_outcome(org, outcome)
            filtered_update = write.filtered
            reason = write.reason

            if not write.applied:
                print("  ⚠️  Conflict: row was modified since we read it, skipping")
                still_failed_count += 1
            elif reason is None:
                print(f"  ✅ Updated fields: {', '.join(filtered_update.keys())}")
                success_count += 1
            else:
                if filtered_update:
                    print(f"  ✅ Updated fields: {', '.join(filtered_update.keys())}")
                print(f"  ⏸  Still parked: {reason}")
                still_failed_count += 1

        except Exception as e:
            print(f"  ❌ Error: {e}")
            still_failed_count += 1
            _park_org(org_id, SKIP_REASON_EXCEPTION)

        time.sleep(0.5)

    print("\n" + "=" * 80)
    print("RETRY COMPLETE")
    print("=" * 80)
    print(f"Successfully processed: {success_count}")
    print(f"Still failing: {still_failed_count}")
    print(f"Total: {len(orgs_to_retry)}")

if __name__ == '__main__':
    main()
