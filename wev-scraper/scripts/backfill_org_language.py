#!/usr/bin/env python
r"""Backfill organizations.language only (en | fr | bilingual).

By default, classify the organization name with the LLM and inspect its website.
Confirmed bilingual website evidence upgrades a single-language name assessment.

Usage:
    python scripts/backfill_org_language.py --dry-run --limit 20

    CONFIRM_PROD_RUN=YES python scripts/backfill_org_language.py \\
        --prod --dry-run --limit 20

    CONFIRM_PROD_RUN=YES python scripts/backfill_org_language.py --prod

    # Diagnostic opt-outs
    python scripts/backfill_org_language.py --dry-run --no-fetch-web --no-llm
"""

from __future__ import annotations

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
from utils.organization_language import (  # noqa: E402
    classify_org_language,
    make_llm_language_fn,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)

_SELECT = "id, name, description, mission_statement, website, language"


def _missing_language(value: str | None) -> bool:
    return not (value or "").strip()


def _fetch_orgs_needing_language(*, after_id: int = 0) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        query = (
            supabase.table("organizations")
            .select(_SELECT)
            .order("id")
            .range(offset, offset + PAGE_SIZE - 1)
        )
        if after_id:
            query = query.gt("id", after_id)
        resp = query.execute()
        batch = resp.data or []
        if not batch:
            break
        for org in batch:
            if _missing_language(org.get("language")):
                rows.append(org)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def backfill_org_language(
    *,
    dry_run: bool = False,
    limit: int | None = None,
    after_id: int = 0,
    fetch_web: bool = True,
    use_llm: bool = True,
) -> None:
    logger.info(
        "Fetching organizations missing language%s%s...",
        " (with web fetch)" if fetch_web else "",
        " (with name LLM)" if use_llm else "",
    )
    orgs = _fetch_orgs_needing_language(after_id=after_id)
    if limit is not None:
        orgs = orgs[:limit]

    if not orgs:
        logger.info("No organizations need language backfill.")
        return

    llm_fn = make_llm_language_fn() if use_llm else None
    if use_llm and llm_fn is None:
        logger.warning("No LLM provider available; continuing with website evidence only")

    logger.info(
        "Found %d organization(s) to classify%s.",
        len(orgs),
        " (dry-run)" if dry_run else "",
    )

    updated = 0
    skipped = 0

    for org in orgs:
        try:
            result = classify_org_language(
                name=org.get("name"),
                website=org.get("website"),
                fetch_web=fetch_web,
                llm_fn=llm_fn,
            )
            if not result.language:
                skipped += 1
                logger.info(
                    "skip org_id=%s name=%r source=%s reasons=%s",
                    org["id"],
                    org.get("name"),
                    result.source,
                    result.reasons,
                )
                continue

            payload = {"language": result.language}
            logger.info(
                "%s org_id=%s name=%r → %s (source=%s conf=%.2f reasons=%s)",
                "would update" if dry_run else "update",
                org["id"],
                org.get("name"),
                result.language,
                result.source,
                result.confidence,
                result.reasons,
            )
            if not dry_run:
                resp = (
                    supabase.table("organizations")
                    .update(payload)
                    .eq("id", org["id"])
                    .execute()
                )
                if not resp.data:
                    skipped += 1
                    logger.warning("update returned no data for org_id=%s", org["id"])
                    continue
            updated += 1
        finally:
            # Throttle web fetches on every attempt (skip / failed write included).
            if fetch_web:
                time.sleep(0.4)

    logger.info(
        "Done. %d updated, %d skipped%s.",
        updated,
        skipped,
        " (dry-run — no writes)" if dry_run else "",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--prod", action="store_true", help="Use production database")
    parser.add_argument("--dry-run", action="store_true", help="Print without writing")
    parser.add_argument("--limit", type=int, default=None, metavar="N")
    parser.add_argument("--after-id", type=int, default=0, help="Resume after this org id")
    parser.add_argument(
        "--no-fetch-web",
        action="store_false",
        dest="fetch_web",
        help="Disable homepage fetch and dual-locale probing",
    )
    parser.add_argument(
        "--no-llm",
        action="store_false",
        dest="use_llm",
        help="Disable the initial LLM organization-name assessment",
    )
    parser.set_defaults(fetch_web=True, use_llm=True)
    args = parser.parse_args()
    backfill_org_language(
        dry_run=args.dry_run,
        limit=args.limit,
        after_id=args.after_id,
        fetch_web=args.fetch_web,
        use_llm=args.use_llm,
    )
