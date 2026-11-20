#!/usr/bin/env python3
"""Reclassify specific organizations based on governance taxonomy review.

Updates governance classifications for organizations identified in the
governance classification review (2026-11-19).
"""

import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from utils.db import supabase
from utils.governance_taxonomy import EXCLUDED_CATEGORY, EXCLUDED_SUBTYPE


def reclassify_organization(
    org_id: int,
    org_name: str,
    new_subtype: str,
    new_category: str,
    reasoning: str,
    confidence: float = 0.95,
):
    """Reclassify a single organization's governance."""
    print(f"\n{'=' * 80}")
    print(f"Reclassifying: {org_name} (ID: {org_id})")
    print(f"New classification: {new_subtype} / {new_category}")
    print(f"Reasoning: {reasoning}")
    print(f"{'=' * 80}\n")

    # Fetch current classification
    resp = supabase.table("organizations").select(
        "id, name, governance_subtype, governance_category, governance_confidence, governance_reasoning"
    ).eq("id", org_id).execute()

    if not resp.data:
        print(f"ERROR: Organization ID {org_id} not found")
        return False

    org = resp.data[0]
    print(f"Current: {org['governance_subtype']} / {org['governance_category']}")
    print(f"Current reasoning: {org['governance_reasoning']}\n")

    # Update the organization
    update_data = {
        "governance_subtype": new_subtype,
        "governance_category": new_category,
        "governance_confidence": confidence,
        "governance_reasoning": reasoning,
    }

    update_resp = supabase.table("organizations").update(update_data).eq("id", org_id).execute()

    if update_resp.data:
        print(f"✅ Successfully reclassified {org_name}")
        return True
    else:
        print(f"❌ Failed to reclassify {org_name}")
        return False


def main():
    """Reclassify the three organizations identified in the review."""
    
    reclassifications = [
        {
            "org_id": 1,
            "org_name": "Bill and Melinda Gates Foundation",
            "new_subtype": EXCLUDED_SUBTYPE,
            "new_category": EXCLUDED_CATEGORY,
            "reasoning": (
                "Private endowed foundation governed by self-perpetuating board of trustees "
                "with no active voting membership. Violates democratic accountability principle "
                "(Principle #2). Reclassified 2026-11-19 per governance taxonomy review."
            ),
            "confidence": 1.0,
        },
        {
            "org_id": 2311,
            "org_name": "Nupqu Resource Limited Partnership",
            "new_subtype": EXCLUDED_SUBTYPE,
            "new_category": EXCLUDED_CATEGORY,
            "reasoning": (
                "Enterprise owned by Ktunaxa Nation Council and four Ktunaxa First Nations - "
                "a public Indigenous government body. Per taxonomy: 'public Indigenous governments "
                "(such as First Nations Band Councils, Inuit land-claim governments, and Métis "
                "self-governments) are excluded as enterprise subtypes.' Not autonomous from "
                "public-authority administration (Principle #1). Reclassified 2026-11-19 per "
                "governance taxonomy review - pending further analysis of Indigenous government "
                "treatment in SSE frameworks."
            ),
            "confidence": 0.85,
        },
        {
            "org_id": 1660,
            "org_name": "Herbert H. Carnegie Future Aces Foundation",
            "new_subtype": EXCLUDED_SUBTYPE,
            "new_category": EXCLUDED_CATEGORY,
            "reasoning": (
                "Private charitable foundation with self-perpetuating board of directors. "
                "No evidence of active voting membership structure. Violates democratic "
                "accountability principle (Principle #2). Reclassified 2026-11-19 per "
                "governance taxonomy review."
            ),
            "confidence": 0.90,
        },
    ]

    print("\n" + "=" * 80)
    print("GOVERNANCE RECLASSIFICATION SCRIPT")
    print("Based on 2026-11-19 Governance Classification Review")
    print("=" * 80)

    success_count = 0
    for reclass in reclassifications:
        if reclassify_organization(**reclass):
            success_count += 1

    print("\n" + "=" * 80)
    print(f"Summary: {success_count}/{len(reclassifications)} organizations reclassified successfully")
    print("=" * 80 + "\n")

    return success_count == len(reclassifications)


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
