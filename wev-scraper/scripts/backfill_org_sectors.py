#!/usr/bin/env python
"""Backfill script to determine sector_id for existing organizations.

Fetches organizations with sector_id IS NULL, batches them, and calls a
targeted LLM prompt to map them to the shared sector taxonomy.

Usage:
    python scripts/backfill_org_sectors.py [--limit N] [--batch-size B] [--dry-run] [--include-non-sse]
"""

import argparse
import json
import logging
import sys
from pathlib import Path

# Ensure wev-scraper root is on sys.path when run as scripts/backfill_org_sectors.py
_SCRAPER_DIR = Path(__file__).resolve().parent.parent
if str(_SCRAPER_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRAPER_DIR))

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Must import settings before anything that uses env vars
from settings import ensure_env_loaded  # noqa: E402

ensure_env_loaded()

from utils.prod_env import bootstrap_prod_from_argv, bootstrap_staging_from_argv  # noqa: E402

bootstrap_staging_from_argv(sys.argv, Path(__file__))
bootstrap_prod_from_argv(sys.argv, Path(__file__))

# Deferred imports
from llm.base import LLMProviderError  # noqa: E402
from llm.factory import get_provider  # noqa: E402
from utils.base_grounded_classifier import BaseGroundedClassifier  # noqa: E402
from utils.db import supabase  # noqa: E402
from utils.sector_prompts import (  # noqa: E402
    SECTOR_BATCH_PROMPT_TEMPLATE,
    canonicalize_sector_id,
    format_org_chunks,
    get_formatted_sector_taxonomy,
)


class SectorBatchAssessor(BaseGroundedClassifier):
    def __init__(self):
        super().__init__()
        self._provider = get_provider("gemini", model="gemini-3.5-flash-lite")
        if not self._provider:
            raise RuntimeError("LLM provider unavailable for SectorBatchAssessor")

    def assess_batch(self, orgs: list[dict]) -> dict[int, str | None]:
        """Assess a batch of organizations and return mapping of org_id -> sector_id."""
        if not orgs:
            return {}

        # Hoist extra.source_categories to the top-level key format_org_chunks expects.
        prepared: list[dict] = []
        for org in orgs:
            row = dict(org)
            if row.get("source_categories") is None:
                extra = row.get("extra")
                if isinstance(extra, dict) and extra.get("source_categories") is not None:
                    row["source_categories"] = extra["source_categories"]
            prepared.append(row)

        prompt = SECTOR_BATCH_PROMPT_TEMPLATE.format(
            taxonomy=get_formatted_sector_taxonomy(),
            organizations_text=format_org_chunks(prepared),
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

        # Handle both {"results": [...]} and [...] formats
        if isinstance(data, list):
            results = data
        elif isinstance(data, dict):
            results = data.get("results", [])
        else:
            logger.warning("Expected JSON to be a dict or list, got %s", type(data).__name__)
            return {}

        if not isinstance(results, list):
            logger.warning("Expected 'results' to be a list, got %s", type(results).__name__)
            return {}

        mapping = {}
        for r in results:
            if not isinstance(r, dict):
                continue

            # The prompt says org_id is provided, but it could be string or int
            raw_org_id = r.get("org_id")
            if raw_org_id is None:
                continue
            try:
                org_id = int(raw_org_id)
            except (TypeError, ValueError):
                continue

            raw_sector = r.get("sector_id")
            sector_id = canonicalize_sector_id(raw_sector)
            if raw_sector and sector_id is None:
                logger.warning(
                    "Rejected unrecognized sector_id %r for org %s",
                    raw_sector,
                    org_id,
                )

            mapping[org_id] = sector_id

        return mapping


def main():
    parser = argparse.ArgumentParser(description="Backfill sector_id for organizations")
    parser.add_argument("--limit", type=int, default=None, metavar="N", help="Process at most N orgs")
    parser.add_argument("--batch-size", type=int, default=10, metavar="B", help="Number of orgs per LLM call")
    parser.add_argument("--dry-run", action="store_true", help="Log output but do not update database")
    parser.add_argument("--include-non-sse", action="store_true", help="Include organizations where is_sse is false/null (default: SSE-only)")
    parser.add_argument("--staging", action="store_true", help="Use staging environment")
    parser.add_argument("--prod", action="store_true", help="Use production environment")
    args = parser.parse_args()

    # By default, only process SSE organizations unless explicitly opted out
    sse_only = not args.include_non_sse

    try:
        assessor = SectorBatchAssessor()
    except Exception as exc:
        logger.error("Failed to initialize assessor: %s", exc)
        sys.exit(1)

    if sse_only:
        logger.info("SSE-only mode: filtering to is_sse=true organizations")
    else:
        logger.warning("Processing ALL organizations (including non-SSE) - use default behavior to filter to SSE only")

    logger.info(
        "Fetching organizations for sector backfill "
        "(sector_remap_v25_community_civic cohort, then other null sector_id)..."
    )

    # Exact former community-civic-infrastructure IDs persisted by the v2.5 remap
    # migration. Select by that table (plus null sector_id) so reassessment does
    # not rely only on a blind null scan — tourist-lodging and other ambiguous
    # residual rows stay identifiable after sector_id was cleared.
    cohort_ids: list[int] = []
    try:
        page_size = 1000
        offset = 0
        while True:
            cohort_resp = (
                supabase.table("sector_remap_v25_community_civic")
                .select("organization_id")
                .order("organization_id")
                .range(offset, offset + page_size - 1)
                .execute()
            )
            rows = cohort_resp.data or []
            for row in rows:
                oid = row.get("organization_id")
                if oid is not None:
                    cohort_ids.append(int(oid))
            if len(rows) < page_size:
                break
            offset += page_size
        if cohort_ids:
            logger.info(
                "Loaded %d orgs from sector_remap_v25_community_civic for reassessment",
                len(cohort_ids),
            )
    except Exception as exc:
        logger.warning(
            "Could not load sector_remap_v25_community_civic cohort (%s); "
            "falling back to null sector_id only",
            exc,
        )

    # Note: extra column may not exist in all environments (e.g., older staging schemas)
    # The code handles missing extra gracefully - it just won't have source_categories hints
    # For staging without extra column, we can still run assessments based on core org fields
    try:
        # Test if extra column exists by trying a tiny query
        supabase.table("organizations").select("extra").limit(1).execute()
        select_cols = "id, name, website, description, mission_statement, extra"
        logger.info("Using extra column for source category hints")
    except Exception:
        select_cols = "id, name, website, description, mission_statement"
        logger.warning("organizations.extra column not found - running without source category hints")
    cohort_id_set = set(cohort_ids)
    processed = 0
    updated = 0
    batch_num = 1

    def _process_orgs(orgs: list[dict]) -> None:
        nonlocal processed, updated, batch_num
        for i in range(0, len(orgs), args.batch_size):
            if args.limit is not None and processed >= args.limit:
                return
            batch = orgs[i : i + args.batch_size]
            if args.limit is not None:
                batch = batch[: max(0, args.limit - processed)]
            if not batch:
                return
            logger.info("Processing batch %d (size %d)...", batch_num, len(batch))
            batch_num += 1

            mapping = assessor.assess_batch(batch)

            for org in batch:
                org_id = org["id"]
                if org_id not in mapping:
                    logger.warning("Org ID %d missing from LLM response", org_id)
                    continue

                sector_id = mapping[org_id]
                logger.info("Org %d (%s) -> %s", org_id, org.get("name", "Unknown"), sector_id)

                if not args.dry_run:
                    supabase.table("organizations").update({"sector_id": sector_id}).eq(
                        "id", org_id
                    ).execute()
                    updated += 1

            processed += len(batch)

    # Pass 1: exact remap cohort (still null after migration).
    for offset in range(0, len(cohort_ids), 500):
        if args.limit is not None and processed >= args.limit:
            break
        page_ids = cohort_ids[offset : offset + 500]
        query = (
            supabase.table("organizations")
            .select(select_cols)
            .in_("id", page_ids)
            .is_("sector_id", "null")
        )
        if sse_only:
            query = query.eq("is_sse", True)
        response = query.order("id").execute()
        _process_orgs(response.data or [])

    # Pass 2: remaining null sector_id rows (never-tagged / other).
    last_id = 0
    while True:
        if args.limit is not None and processed >= args.limit:
            break
        fetch_limit = 1000
        if args.limit is not None:
            fetch_limit = min(args.limit - processed, 1000)

        query = (
            supabase.table("organizations")
            .select(select_cols)
            .is_("sector_id", "null")
        )
        if sse_only:
            query = query.eq("is_sse", True)
        response = query.order("id").gt("id", last_id).limit(fetch_limit).execute()
        rows = response.data or []
        if not rows:
            if processed == 0:
                logger.info("No organizations found missing sector_id.")
            break
        last_id = rows[-1]["id"]
        orgs = [row for row in rows if int(row["id"]) not in cohort_id_set]
        if orgs:
            _process_orgs(orgs)

    logger.info("Done. Processed %d orgs, updated %d orgs.", processed, updated)

if __name__ == "__main__":
    main()
