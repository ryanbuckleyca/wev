#!/usr/bin/env python
"""Backfill script to determine sector_id for existing organizations.

Fetches organizations with sector_id IS NULL, batches them, and calls a 
targeted LLM prompt to map them to the shared sector taxonomy.

Usage:
    python scripts/backfill_org_sectors.py [--limit N] [--batch-size B] [--dry-run] [--sse-only]
"""

import argparse
import json
import logging
import sys
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Must import settings before anything that uses env vars
from settings import ensure_env_loaded
ensure_env_loaded()

from utils.prod_env import bootstrap_staging_from_argv
bootstrap_staging_from_argv(sys.argv, Path(__file__))

# Deferred imports
from llm.base import LLMProviderError
from llm.factory import get_sse_provider
from utils.base_grounded_classifier import BaseGroundedClassifier
from utils.db import supabase
from utils.sector_prompts import (
    SECTOR_BATCH_PROMPT_TEMPLATE,
    format_org_chunks,
    get_formatted_sector_taxonomy,
    get_sector_ids_set,
)


class SectorBatchAssessor(BaseGroundedClassifier):
    def __init__(self):
        super().__init__()
        self._provider = get_sse_provider()
        if not self._provider:
            raise RuntimeError("LLM provider unavailable for SectorBatchAssessor")

    def assess_batch(self, orgs: list[dict]) -> dict[int, str | None]:
        """Assess a batch of organizations and return mapping of org_id -> sector_id."""
        if not orgs:
            return {}

        prompt = SECTOR_BATCH_PROMPT_TEMPLATE.format(
            taxonomy=get_formatted_sector_taxonomy(),
            organizations_text=format_org_chunks(orgs),
        )

        try:
            response_text = self._provider.complete(
                prompt,
                system= "You output only valid JSON. Do not include any text, explanation, or markdown before or after the JSON.",
                temperature=0.0,
            )
        except LLMProviderError as exc:
            logger.error("LLMProviderError during batch sector assessment: %s", exc)
            return {}

        text = self._extract_json_block(response_text)
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            logger.warning("Failed to parse JSON for batch: %s — response: %r", exc, response_text[:200])
            return {}

        results = data.get("results", [])
        if not isinstance(results, list):
            logger.warning("Expected 'results' to be a list, got %s", type(results).__name__)
            return {}

        valid_sectors = get_sector_ids_set()
        mapping = {}
        for r in results:
            if not isinstance(r, dict):
                continue
            
            # The prompt says org_id is provided, but it could be string or int
            raw_org_id = r.get("org_id")
            try:
                org_id = int(raw_org_id)
            except (TypeError, ValueError):
                continue
                
            sector_id = r.get("sector_id")
            if sector_id and sector_id not in valid_sectors:
                sector_id = None
            
            mapping[org_id] = sector_id

        return mapping


def main():
    parser = argparse.ArgumentParser(description="Backfill sector_id for organizations")
    parser.add_argument("--limit", type=int, default=None, metavar="N", help="Process at most N orgs")
    parser.add_argument("--batch-size", type=int, default=10, metavar="B", help="Number of orgs per LLM call")
    parser.add_argument("--dry-run", action="store_true", help="Log output but do not update database")
    parser.add_argument("--sse-only", action="store_true", help="Only process organizations where is_sse is true")
    parser.add_argument("--staging", action="store_true", help="Use staging environment")
    parser.add_argument("--prod", action="store_true", help="Use production environment")
    args = parser.parse_args()

    try:
        assessor = SectorBatchAssessor()
    except Exception as exc:
        logger.error("Failed to initialize assessor: %s", exc)
        sys.exit(1)

    logger.info("Fetching organizations with missing sector_id...")
    
    processed = 0
    updated = 0
    last_id = 0
    
    while True:
        query = supabase.table("organizations").select("id, name, website, description, mission_statement").is_("sector_id", "null")
        if args.sse_only:
            query = query.eq("is_sse", True)
        
        fetch_limit = 1000
        if args.limit:
            remaining = args.limit - processed
            if remaining <= 0:
                break
            fetch_limit = min(remaining, 1000)
            
        response = query.order("id").gt("id", last_id).limit(fetch_limit).execute()
        orgs = response.data
        
        if not orgs:
            if processed == 0:
                logger.info("No organizations found missing sector_id.")
            break
            
        for i in range(0, len(orgs), args.batch_size):
            batch = orgs[i:i + args.batch_size]
            logger.info("Processing batch %d (size %d)...", (processed // args.batch_size) + 1, len(batch))
            
            mapping = assessor.assess_batch(batch)
            
            for org in batch:
                org_id = org["id"]
                if org_id not in mapping:
                    logger.warning("Org ID %d missing from LLM response", org_id)
                    continue
                    
                sector_id = mapping[org_id]
                logger.info("Org %d (%s) -> %s", org_id, org.get("name", "Unknown"), sector_id)
                
                if not args.dry_run:
                    # Update DB
                    supabase.table("organizations").update({"sector_id": sector_id}).eq("id", org_id).execute()
                    updated += 1
                    
            processed += len(batch)
            
        last_id = orgs[-1]["id"]
        
    logger.info("Done. Processed %d orgs, updated %d orgs.", processed, updated)

if __name__ == "__main__":
    main()
