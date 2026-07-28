#!/usr/bin/env python
r"""Backfill organizations.language only (en | fr | bilingual).

V1 (default): stored name/description/mission + website URL path hints.
V2 (--fetch-web): neutral homepage fetch, hreflang/switcher discovery, dual probe.

Usage:
    python scripts/backfill_org_language.py --dry-run --limit 20

    CONFIRM_PROD_RUN=YES python scripts/backfill_org_language.py \\
        --prod --dry-run --limit 20

    CONFIRM_PROD_RUN=YES python scripts/backfill_org_language.py --prod

    # Include homepage fetch (V2)
    CONFIRM_PROD_RUN=YES python scripts/backfill_org_language.py --prod --fetch-web

    # LLM only when deterministic signals are ambiguous
    CONFIRM_PROD_RUN=YES python scripts/backfill_org_language.py --prod --use-llm
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
    fetch_web: bool = False,
    use_llm: bool = False,
) -> None:
    logger.info(
        "Fetching organizations missing language%s%s...",
        " (with web fetch)" if fetch_web else "",
        " (llm fallback)" if use_llm else "",
    )
    orgs = _fetch_orgs_needing_language(after_id=after_id)
    if limit is not None:
        orgs = orgs[:limit]

    if not orgs:
        logger.info("No organizations need language backfill.")
        return

    llm_fn = make_llm_language_fn() if use_llm else None
    if use_llm and llm_fn is None:
        logger.warning("--use-llm requested but no LLM provider available; continuing without it")

    logger.info(
        "Found %d organization(s) to classify%s.",
        len(orgs),
        " (dry-run)" if dry_run else "",
    )

    updated = 0
    skipped = 0

    for org in orgs:
        result = classify_org_language(
            name=org.get("name"),
            description=org.get("description"),
            mission_statement=org.get("mission_statement"),
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
        "--fetch-web",
        action="store_true",
        help="V2: neutral homepage fetch + dual-locale probe",
    )
    parser.add_argument(
        "--use-llm",
        action="store_true",
        help="Call LLM only when deterministic signals are ambiguous",
    )
    args = parser.parse_args()
    backfill_org_language(
        dry_run=args.dry_run,
        limit=args.limit,
        after_id=args.after_id,
        fetch_web=args.fetch_web,
        use_llm=args.use_llm,
    )
