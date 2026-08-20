#!/usr/bin/env python3
"""Backfill headquarters municipality and province for organizations with missing locations."""

import sys
import time

from llm.tavily_grounding import is_tavily_available
from utils.db import supabase
from utils.location_parser import parse_address_with_geocodio
from utils.organization_assessment import OrganizationAssessor


def _missing(value: object) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def _build_location_update_fields(
    org: dict,
    *,
    municipality: str | None,
    province: str | None,
    geo_data: dict,
) -> dict:
    update_fields = {}
    if _missing(org.get("municipality")) and municipality:
        update_fields["municipality"] = municipality
    if _missing(org.get("province")) and province:
        update_fields["province"] = province
    for field in ("lat", "lng", "geocode_accuracy_type"):
        value = geo_data.get(field)
        if _missing(org.get(field)) and value is not None:
            update_fields[field] = value
    return update_fields


def main() -> None:
    if not is_tavily_available():
        print("=" * 80)
        print("ERROR: TAVILY NOT AVAILABLE")
        print("=" * 80)
        print("Tavily grounding is required for accurate organization assessment.")
        sys.exit(1)

    assessor = OrganizationAssessor()

    print("=" * 80)
    print("BACKFILLING ORGANIZATION HEADQUARTERS")
    print("=" * 80)

    # Fetch organizations where municipality is null but location is populated
    print("\nFetching affected organizations from database...")
    all_orgs = []
    last_id = 0
    page_size = 1000

    try:
        while True:
            response = supabase.table('organizations').select('*').is_('municipality', 'null').not_.is_('location', 'null').gt('id', last_id).order('id').limit(page_size).execute()
            if not response.data:
                break
            all_orgs.extend(response.data)
            if len(response.data) < page_size:
                break
            last_id = response.data[-1]['id']
    except Exception as e:
        print(f"❌ Failed to fetch organizations from database: {e}")
        sys.exit(1)

    print(f"Found {len(all_orgs)} affected organizations.")

    if not all_orgs:
        print("\n✅ All organizations have municipality populated or lack location entirely!")
        return

    # Use dry-run flag for safety
    dry_run = "--run" not in sys.argv
    if dry_run:
        print("\n⚠️  DRY RUN: Pass --run to actually update the database.")

    print("\nProcessing organizations...")
    success_count = 0
    error_count = 0
    no_change_count = 0
    dry_run_count = 0

    for i, org in enumerate(all_orgs, 1):
        org_id = org['id']
        name = org.get('name', '(unnamed)')
        loc_str = org.get('location')
        website = org.get('website')

        print(f"\n[{i}/{len(all_orgs)}] Processing: {name}")
        print(f"  Current DB Location: {loc_str}")
        print(f"  Website: {website}")

        existing_description = org.get('description_en') or org.get('description')

        try:
            # We call assess() directly so we can inspect headquarters extracted by LLM
            result = assessor.assess(
                raw_name=name,
                municipality=None,
                province=None,
                job_title="",
                description="",
                known_website=website,
                existing_description=existing_description,
            )

            if result:
                llm_mun = result.get("headquarters_municipality")
                llm_prov = result.get("headquarters_province")

                if llm_mun or llm_prov:
                    print(f"  🧠 LLM extracted HQ: {llm_mun}, {llm_prov}")
                    hq_loc = ", ".join(part for part in (llm_mun, llm_prov) if part)
                    geo_data = parse_address_with_geocodio(hq_loc)

                    municipality = geo_data.get("municipality") or llm_mun
                    province = geo_data.get("province") or llm_prov

                    print(f"  📍 Geocoded HQ: {municipality}, {province} (lat={geo_data.get('lat')}, lng={geo_data.get('lng')})")

                    update_fields = _build_location_update_fields(
                        org,
                        municipality=municipality,
                        province=province,
                        geo_data=geo_data,
                    )

                    if not update_fields:
                        print("  ⚠️  No missing non-null location fields to update")
                        no_change_count += 1
                    elif not dry_run:
                        read_at = org.get('updated_at')
                        query = supabase.table('organizations').update(update_fields).eq('id', org_id)
                        if read_at:
                            query = query.eq('updated_at', read_at)
                        resp = query.execute()
                        if resp.data:
                            print(f"  ✅ Updated fields: {', '.join(update_fields.keys())}")
                            success_count += 1
                        else:
                            print("  ⚠️  Conflict: row was modified since we read it, skipping")
                            error_count += 1
                    else:
                        print(f"  ✅ Would update: {update_fields}")
                        dry_run_count += 1
                else:
                    print("  ⚠️  LLM found no HQ (Remote/Unknown)")
                    no_change_count += 1
            else:
                print("  ❌ Assessment failed")
                error_count += 1

        except Exception as e:
            print(f"  ❌ Error: {e}")
            error_count += 1

        time.sleep(0.5)

    print("\n" + "=" * 80)
    print("BACKFILL COMPLETE" + (" (DRY RUN)" if dry_run else ""))
    print("=" * 80)
    if dry_run:
        print(f"Would update:          {dry_run_count}")
        print(f"No HQ found / no-op:   {no_change_count}")
        print(f"Failed:                {error_count}")
    else:
        print(f"Successfully processed: {success_count}")
        print(f"No HQ found / no-op:    {no_change_count}")
        print(f"Failed:                 {error_count}")
    print(f"Total processed: {len(all_orgs)}")

if __name__ == '__main__':
    main()
