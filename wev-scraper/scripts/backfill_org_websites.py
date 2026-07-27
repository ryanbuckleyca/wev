#!/usr/bin/env python
"""Re-assess organizations with the grounded OrganizationAssessor.

Modes
-----
website  Only orgs missing a website; write ``website`` when evidence-grade.
full     Re-assess description / mission / values / type / sector / SSE / website.
         Uses a known official site in search when present. Overwrites existing
         assessment fields.

Usage:
    # Website-only dry-run (3 orgs, no writes)
    python scripts/backfill_org_websites.py --dry-run --limit 3

    # Full reassess dry-run (first 3)
    CONFIRM_PROD_RUN=YES python scripts/backfill_org_websites.py \\
        --prod --mode full --dry-run --limit 3

    # Full reassess; resume after timeout without redoing earlier ids
    CONFIRM_PROD_RUN=YES python scripts/backfill_org_websites.py \\
        --prod --mode full --after-id 120

    # Skip orgs assessed in the last 24h (default); disable with --skip-recent-hours 0
    CONFIRM_PROD_RUN=YES python scripts/backfill_org_websites.py \\
        --prod --mode full --skip-recent-hours 24
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from utils.prod_env import bootstrap_prod_from_argv, confirm_prod_run

if "--prod" in sys.argv[1:]:
    confirm_prod_run(full_prod=True)
    bootstrap_prod_from_argv(sys.argv[1:], Path(__file__))
    print("Using PRODUCTION database")
else:
    print("Using TEST database")

from utils.db import supabase  # noqa: E402
from utils.organization_assessment import OrganizationAssessor  # noqa: E402
from utils.organization_cache import evidence_domain  # noqa: E402
from utils.organization_repository import OrganizationRepository  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

_SELECT = (
    "id, name, location, municipality, province, website, description, "
    "mission_statement, sse_rating, is_sse, type, values_list, sse_details"
)


def fetch_orgs_missing_website(*, limit: int, after_id: int = 0) -> list[dict]:
    """Orgs with null/empty website, ordered by id."""
    resp = (
        supabase.table("organizations")
        .select(_SELECT)
        .or_("website.is.null,website.eq.")
        .gt("id", after_id)
        .order("id")
        .limit(limit)
        .execute()
    )
    rows = resp.data or []
    return [r for r in rows if not (r.get("website") or "").strip()]


def fetch_orgs_any(*, limit: int, after_id: int = 0) -> list[dict]:
    """Any orgs ordered by id (for full reassess)."""
    resp = (
        supabase.table("organizations")
        .select(_SELECT)
        .gt("id", after_id)
        .order("id")
        .limit(limit)
        .execute()
    )
    return resp.data or []


def _preview_text(value: str | None, *, max_len: int | None = None) -> str | None:
    """Log-friendly text. DB content is not shortened here.

    If max_len is set and the string is longer, only the log line is cut and
    marked so it is obvious the stored value is intact.
    """
    if not value:
        return None
    if max_len is None or len(value) <= max_len:
        return value
    omitted = len(value) - max_len
    return f"{value[:max_len].rstrip()}… (+{omitted} chars truncated from log)"


def _log_full_preview(org: dict, updates: dict, *, dry_run: bool) -> None:
    old_details = org.get("sse_details") or {}
    new_details = updates.get("sse_details") or {}
    if not isinstance(old_details, dict):
        old_details = {}
    if not isinstance(new_details, dict):
        new_details = {}
    # Log full mission/description; only clip very long reasoning for the log line.
    logger.info(
        "%s org_id=%s (%s)\n"
        "  sse: %s → %s | is_sse: %s → %s\n"
        "  website: %s → %s\n"
        "  type: %s → %s\n"
        "  mission: %r → %r\n"
        "  description: %r → %r\n"
        "  values: %s → %s\n"
        "  sse_reasoning (old): %s\n"
        "  sse_reasoning (new): %s",
        "would update" if dry_run else "update",
        org["id"],
        org.get("name"),
        org.get("sse_rating"),
        updates.get("sse_rating"),
        org.get("is_sse"),
        updates.get("is_sse"),
        org.get("website"),
        updates.get("website", org.get("website")),
        org.get("type"),
        updates.get("type"),
        _preview_text(org.get("mission_statement")),
        _preview_text(updates.get("mission_statement")),
        _preview_text(org.get("description")),
        _preview_text(updates.get("description")),
        org.get("values_list"),
        updates.get("values_list"),
        _preview_text(old_details.get("reasoning"), max_len=800) or "(none)",
        _preview_text(new_details.get("reasoning"), max_len=800)
        or "(no reasoning returned)",
    )


def _parse_classified_at(org: dict) -> datetime | None:
    details = org.get("sse_details")
    if not isinstance(details, dict):
        return None
    raw = details.get("classified_at")
    if not raw or not isinstance(raw, str):
        return None
    try:
        # Support trailing Z
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def _assessed_recently(org: dict, *, within: timedelta) -> bool:
    classified_at = _parse_classified_at(org)
    if classified_at is None:
        return False
    if classified_at.tzinfo is None:
        classified_at = classified_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - classified_at <= within


def run(
    *,
    mode: str,
    limit: int | None,
    dry_run: bool,
    delay_seconds: float,
    after_id: int = 0,
    skip_recent_hours: float | None = None,
) -> dict:
    try:
        assessor = OrganizationAssessor()
    except Exception as exc:
        logger.error("OrganizationAssessor unavailable: %s", exc)
        return {"processed": 0, "updated": 0, "skipped": 0, "errors": 1, "dry_run": dry_run}

    repo = OrganizationRepository(supabase)
    processed = 0
    updated = 0
    skipped = 0
    skipped_recent = 0
    errors = 0
    cursor = after_id
    fetch = fetch_orgs_missing_website if mode == "website" else fetch_orgs_any
    recent_window = (
        timedelta(hours=skip_recent_hours)
        if skip_recent_hours is not None and skip_recent_hours > 0
        else None
    )
    if after_id:
        logger.info("Resuming after org id=%s", after_id)
    if recent_window:
        logger.info(
            "Skipping orgs assessed within the last %s hours",
            skip_recent_hours,
        )

    while limit is None or processed < limit:
        batch_size = 25 if limit is None else min(25, limit - processed)
        # When skipping recent, over-fetch a bit so we still fill --limit.
        if recent_window is not None:
            batch_size = max(batch_size, 25)
        if batch_size <= 0:
            break
        rows = fetch(limit=batch_size, after_id=cursor)
        if not rows:
            logger.info("No more orgs to process.")
            break

        for org in rows:
            if limit is not None and processed >= limit:
                break
            org_id = org["id"]
            name = org.get("name") or ""
            cursor = org_id

            if recent_window is not None and _assessed_recently(org, within=recent_window):
                classified_at = _parse_classified_at(org)
                logger.info(
                    "skip org_id=%s (%s) — assessed recently (%s)",
                    org_id,
                    name,
                    classified_at.isoformat() if classified_at else "?",
                )
                skipped_recent += 1
                continue

            processed += 1
            try:
                if mode == "website":
                    result = assessor.assess(
                        raw_name=name,
                        municipality=org.get("municipality"),
                        province=org.get("province"),
                        job_title="",
                        description=org.get("description") or "",
                        known_website=org.get("website"),
                    )
                    website = (result or {}).get("website") if result else None
                    if not website or not evidence_domain(website):
                        logger.info(
                            "skip org_id=%s (%s) — no employer-owned website",
                            org_id,
                            name,
                        )
                        skipped += 1
                    else:
                        logger.info(
                            "%s org_id=%s (%s) → website=%s",
                            "would update" if dry_run else "update",
                            org_id,
                            name,
                            website,
                        )
                        if not dry_run:
                            repo.update_org(org_id, website=website)
                        updated += 1
                else:
                    updates = assessor.assess_and_build_update(org)
                    if updates is None:
                        logger.info(
                            "skip org_id=%s (%s) — assessor returned None",
                            org_id,
                            name,
                        )
                        skipped += 1
                    else:
                        _log_full_preview(org, updates, dry_run=dry_run)
                        if not dry_run:
                            repo.update_org(org_id, **updates)
                        updated += 1
            except Exception as exc:
                logger.error("Error org_id=%s: %s", org_id, exc, exc_info=True)
                errors += 1

            if delay_seconds > 0:
                time.sleep(delay_seconds)

        if len(rows) < batch_size:
            break

    summary = {
        "mode": mode,
        "processed": processed,
        "updated": updated,
        "skipped": skipped,
        "skipped_recent": skipped_recent,
        "errors": errors,
        "dry_run": dry_run,
        "limit": limit,
        "last_id": cursor,
        "resume_with": f"--after-id {cursor}" if cursor else None,
    }
    logger.info("Summary: %s", summary)
    if cursor:
        logger.info(
            "To resume after a timeout without redoing earlier rows: "
            "add --after-id %s",
            cursor,
        )
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Re-assess org websites and/or SSE/mission/values via grounded LLM."
    )
    parser.add_argument("--prod", action="store_true", help="Use production database.")
    parser.add_argument(
        "--mode",
        choices=("website", "full"),
        default="website",
        help="website = fill missing sites only; full = reassess SSE/mission/values/etc.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Call the assessor but do not write to the DB.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Max orgs to assess. Omit to process all matching orgs.",
    )
    parser.add_argument(
        "--after-id",
        type=int,
        default=0,
        metavar="ID",
        help="Resume after this organization id (exclusive). Use last_id from a prior run.",
    )
    parser.add_argument(
        "--skip-recent-hours",
        type=float,
        default=24,
        metavar="H",
        help=(
            "Skip orgs whose sse_details.classified_at is within the last H hours "
            "(default: 24). Set 0 to disable."
        ),
    )
    parser.add_argument(
        "--delay-seconds",
        type=float,
        default=0.5,
        help="Pause between org assessments (default: 0.5).",
    )
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be >= 1")
    if args.after_id < 0:
        parser.error("--after-id must be >= 0")

    run(
        mode=args.mode,
        limit=args.limit,
        dry_run=args.dry_run,
        delay_seconds=args.delay_seconds,
        after_id=args.after_id,
        skip_recent_hours=args.skip_recent_hours,
    )


if __name__ == "__main__":
    main()
