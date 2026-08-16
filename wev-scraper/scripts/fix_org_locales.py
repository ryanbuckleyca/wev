#!/usr/bin/env python
r"""Fix swapped locales in organizations table.

Usage:
    python scripts/fix_org_locales.py --dry-run
    CONFIRM_PROD_RUN=YES python scripts/fix_org_locales.py --prod
"""

import argparse
import logging
import sys
import time
from pathlib import Path

from utils.prod_env import bootstrap_prod_from_argv, confirm_prod_run

if "--prod" in sys.argv[1:]:
    confirm_prod_run(full_prod=True)
    bootstrap_prod_from_argv(sys.argv[1:], Path(__file__))
    print("Using PRODUCTION database")
else:
    print("Using TEST database")

from utils.db import PAGE_SIZE, supabase  # noqa: E402
from utils.organization_language import _detect_text_language  # noqa: E402
from utils.organization_assessment import _LOCALE_FIELD_PAIRS, _translate_text  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)

# Also we need to check sse_details for reasoning
_SELECT = "id, name, description_en, description_fr, mission_statement_en, mission_statement_fr, sse_details"

def _fetch_all_orgs() -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        query = (
            supabase.table("organizations")
            .select(_SELECT)
            .order("id")
            .range(offset, offset + PAGE_SIZE - 1)
        )
        resp = query.execute()
        batch = resp.data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def fix_org_locales(dry_run: bool = False) -> None:
    orgs = _fetch_all_orgs()
    logger.info("Fetched %d organizations to check", len(orgs))

    fixed_count = 0
    
    for org in orgs:
        updates = {}
        
        # We need to construct a dict that matches what _enforce_locale_correctness expects
        # so we can reuse our logic, or just reimplement the logic here on the DB fields.
        # We will check description, mission, and sse_details reasoning
        
        sse_details = org.get("sse_details") or {}
        
        # Build a temporary dict of the values
        vals = {
            "description_en": org.get("description_en"),
            "description_fr": org.get("description_fr"),
            "mission_statement_en": org.get("mission_statement_en"),
            "mission_statement_fr": org.get("mission_statement_fr"),
            "sse_reasoning_en": sse_details.get("reasoning_en"),
            "sse_reasoning_fr": sse_details.get("reasoning_fr"),
        }
        
        for en_key, fr_key in _LOCALE_FIELD_PAIRS:
            en_val = vals.get(en_key)
            fr_val = vals.get(fr_key)
            
            # If one is missing but the other exists, translate it
            if en_val and not fr_val:
                translated = _translate_text(en_val, "fr")
                if translated:
                    updates[fr_key] = translated
                    logger.info("[%s] Translated %s to French", org.get("name"), en_key)
            elif fr_val and not en_val:
                translated = _translate_text(fr_val, "en")
                if translated:
                    updates[en_key] = translated
                    logger.info("[%s] Translated %s to English", org.get("name"), fr_key)
                
        if not updates:
            continue
            
        fixed_count += 1
        
        if dry_run:
            logger.info("Would update %s with %s", org.get("name"), list(updates.keys()))
            continue
            
        # We need to apply these updates to supabase
        # Separate DB top-level fields vs sse_details JSON field
        db_updates = {}
        for k, v in updates.items():
            if k in ("sse_reasoning_en", "sse_reasoning_fr"):
                # update sse_details
                if "sse_details" not in db_updates:
                    # we must perform a shallow copy of the json
                    db_updates["sse_details"] = dict(sse_details)
                db_updates["sse_details"][k.replace("sse_", "")] = v
            else:
                db_updates[k] = v
                # update legacy fallback as well if we are touching description or mission
                if k.startswith("description_"):
                    en_val_now = db_updates.get("description_en", vals.get("description_en"))
                    fr_val_now = db_updates.get("description_fr", vals.get("description_fr"))
                    db_updates["description"] = en_val_now or fr_val_now
                elif k.startswith("mission_statement_"):
                    en_val_now = db_updates.get("mission_statement_en", vals.get("mission_statement_en"))
                    fr_val_now = db_updates.get("mission_statement_fr", vals.get("mission_statement_fr"))
                    db_updates["mission_statement"] = en_val_now or fr_val_now
                    
        if "sse_details" in db_updates:
            # recalculate top-level reasoning
            en_val_now = db_updates["sse_details"].get("reasoning_en", vals.get("sse_reasoning_en"))
            fr_val_now = db_updates["sse_details"].get("reasoning_fr", vals.get("sse_reasoning_fr"))
            db_updates["sse_details"]["reasoning"] = en_val_now or fr_val_now
            
        logger.info("Updating %s: %s", org.get("name"), list(db_updates.keys()))
        try:
            supabase.table("organizations").update(db_updates).eq("id", org["id"]).execute()
        except Exception as e:
            logger.error("Failed to update org %s: %s", org["id"], e)
            
        time.sleep(0.1)

    logger.info("Completed. Fixed %d organizations", fixed_count)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fix swapped locales in organizations")
    parser.add_argument("--prod", action="store_true", help="Run against production database")
    parser.add_argument("--dry-run", action="store_true", help="Print updates without saving")
    args = parser.parse_args()
    
    fix_org_locales(dry_run=args.dry_run)
