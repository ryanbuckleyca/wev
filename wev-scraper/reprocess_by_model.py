#!/usr/bin/env python3
"""Reprocess organizations based on model tracking status."""

import json
import sys
import time

from dotenv import load_dotenv

load_dotenv('../.env')

from llm.tavily_grounding import is_tavily_available  # noqa: E402
from utils.db import supabase  # noqa: E402
from utils.organization_assessment import OrganizationAssessor, _result_to_db_fields  # noqa: E402


def get_orgs_by_model(model_filter=None):
    """Get organizations filtered by model used.

    Args:
        model_filter: 'groq', 'no_tracking', or specific model name
    """
    all_orgs = []
    last_id = 0
    page_size = 1000

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

    filtered = []
    for org in all_orgs:
        sse_details = org.get('sse_details')
        model_flag = None

        if sse_details:
            try:
                if isinstance(sse_details, str):
                    details = json.loads(sse_details)
                else:
                    details = sse_details

                flags = details.get('flags', [])
                for flag in flags:
                    if flag.startswith('model:'):
                        model_flag = flag.replace('model:', '')
                        break
            except Exception:
                pass

        if model_filter == 'no_tracking' and model_flag is None:
            filtered.append(org)
        elif model_filter and model_flag == model_filter:
            filtered.append(org)
        elif model_filter is None:
            filtered.append((org, model_flag))

    return filtered

def main():
    if len(sys.argv) < 2:
        print("Usage: python reprocess_by_model.py <model_name|no_tracking> [--limit N]")
        print("\nOptions:")
        print("  <model_name> - Reprocess organizations processed with this model (e.g., groq, ollama)")
        print("  no_tracking  - Reprocess organizations without model tracking")
        print("  --limit N    - Limit to N organizations (default: all)")
        sys.exit(1)

    mode = sys.argv[1]
    limit = None

    if '--limit' in sys.argv:
        limit_idx = sys.argv.index('--limit')
        if limit_idx + 1 < len(sys.argv):
            try:
                limit = int(sys.argv[limit_idx + 1])
                if limit <= 0:
                    print("❌ Error: --limit must be a positive integer.")
                    sys.exit(1)
            except ValueError:
                print("❌ Error: --limit must be a valid integer.")
                sys.exit(1)

    # Check Tavily
    if not is_tavily_available():
        print("=" * 80)
        print("ERROR: TAVILY NOT AVAILABLE")
        print("=" * 80)
        print("\nTavily grounding is required for reprocessing.")
        print("Check TAVILY_API_KEY and quota.")
        sys.exit(1)

    print("=" * 80)
    print(f"REPROCESSING: {mode.upper()}")
    print("=" * 80)

    # Get organizations
    if mode == 'no_tracking':
        orgs = get_orgs_by_model('no_tracking')
        print(f"\nFound {len(orgs)} organizations without model tracking")
    else:
        orgs = get_orgs_by_model(mode)
        print(f"\nFound {len(orgs)} organizations processed with {mode}")

    if not orgs:
        print("No organizations to process!")
        return

    if limit:
        orgs = orgs[:limit]
        print(f"Limited to {limit} organizations")

    # Show sample
    print("\nSample organizations:")
    for org in orgs[:5]:
        print(f"  • {org.get('name')} ({org.get('municipality')}, {org.get('province')})")
    if len(orgs) > 5:
        print(f"  ... and {len(orgs) - 5} more")

    if '--yes' not in sys.argv:
        confirm = input(f"\nReprocess {len(orgs)} organizations? (yes/no): ")
        if confirm.lower() != 'yes':
            print("Cancelled.")
            return

    print("\nProcessing...")
    assessor = OrganizationAssessor()

    success_count = 0
    error_count = 0

    for i, org in enumerate(orgs, 1):
        org_id = org['id']
        name = org.get('name', '(unnamed)')
        municipality = org.get('municipality')
        province = org.get('province')
        website = org.get('website')

        print(f"\n[{i}/{len(orgs)}] Processing: {name}")

        try:
            existing_description = org.get('description_en') or org.get('description')

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

                # Always update to get new model tracking
                if update_fields:
                    supabase.table('organizations').update(update_fields).eq('id', org_id).execute()
                    print(f"  ✅ Updated {len(update_fields)} fields:")
                    for field, new_val in sorted(update_fields.items()):
                        old_val = org.get(field)
                        # Truncate long values for readability
                        old_str = str(old_val) if old_val is not None else '(none)'
                        new_str = str(new_val) if new_val is not None else '(none)'
                        if len(old_str) > 80:
                            old_str = old_str[:77] + '...'
                        if len(new_str) > 80:
                            new_str = new_str[:77] + '...'
                        if old_val != new_val:
                            print(f"     {field}: {old_str} → {new_str}")
                        else:
                            print(f"     {field}: (unchanged) {new_str}")
                    success_count += 1
                else:
                    print("  ⚠️  No fields to update")
            else:
                print("  ❌ Assessment failed")
                error_count += 1

        except Exception as e:
            print(f"  ❌ Error: {e}")
            error_count += 1

        time.sleep(0.5)

    print("\n" + "=" * 80)
    print("PROCESSING COMPLETE")
    print("=" * 80)
    print(f"Success: {success_count}")
    print(f"Failed: {error_count}")
    print(f"Total: {len(orgs)}")

if __name__ == '__main__':
    main()
