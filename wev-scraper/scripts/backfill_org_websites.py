#!/usr/bin/env python
r"""Re-assess organizations with the grounded OrganizationAssessor.

Bypasses OrganizationResolver's alias-cache / existing-org short-circuit: each
mode queries the organizations table and calls OrganizationAssessor directly.

Modes
-----
website  Only orgs missing a website; write ``website`` when evidence-grade.
minimal  Only never-assessed / minimal-fallback rows (``sse_rating IS NULL``),
         including rows remapped off the retired ``social enterprise`` type.
         These are created when the assessor fails during scrape (or when a
         bad type label is cleared); later scrapes reuse them by name and
         never re-trigger assessment. This mode is the targeted fix for that set.
full     Re-assess description / mission / values / type / sector / SSE / website
         for all orgs. Overwrites existing assessment fields, except
         admin-reviewed SSE (``sse_details.reviewed`` / ``admin_override``)
         unless ``--force-reviewed``.

Completed assessments (``sse_details.classified_at`` set) are skipped by default.
Pass ``--overwrite-recent-hours N`` to re-do orgs assessed within the last N hours.

Usage:
    # Website-only dry-run (3 orgs, no writes)
    python scripts/backfill_org_websites.py --dry-run --limit 3

    # Re-assess minimal-fallback / unrated orgs only
    CONFIRM_PROD_RUN=YES python scripts/backfill_org_websites.py \\
        --prod --mode minimal --dry-run --limit 10

    # Full reassess dry-run (first 3); skips already-classified orgs
    CONFIRM_PROD_RUN=YES python scripts/backfill_org_websites.py \\
        --prod --mode full --dry-run --limit 3

    # Full reassess; resume after timeout without redoing earlier ids
    CONFIRM_PROD_RUN=YES python scripts/backfill_org_websites.py \\
        --prod --mode full --after-id 120

    # Re-do orgs assessed in the last hour (e.g. fix a bad batch)
    CONFIRM_PROD_RUN=YES python scripts/backfill_org_websites.py \\
        --prod --mode full --overwrite-recent-hours 1 --limit 10
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from settings import ensure_env_loaded
from utils.prod_env import bootstrap_prod_from_argv, confirm_prod_run

# Load base .env (LLM keys) before prod DB credential overlay.
ensure_env_loaded()

if "--prod" in sys.argv[1:] or "--publish" in sys.argv[1:]:
    confirm_prod_run(full_prod="--prod" in sys.argv[1:])
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
    "mission_statement, sse_rating, is_sse, type, sector_id, language, values_list, sse_details"
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


def fetch_orgs_minimal(*, limit: int, after_id: int = 0) -> list[dict]:
    """Never-assessed / minimal-fallback orgs (``sse_rating IS NULL``).

    Resolver writes these when OrganizationAssessor fails; subsequent scrapes
    match by name and skip the assessor. Re-assess via this query + direct
    ``assess_and_build_update`` (no alias cache).
    """
    resp = (
        supabase.table("organizations")
        .select(_SELECT)
        .is_("sse_rating", "null")
        .gt("id", after_id)
        .order("id")
        .limit(limit)
        .execute()
    )
    return resp.data or []


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


def fetch_recent_job_for_org(org: dict) -> dict | None:
    """Recent job linked to *org* (by organization_id, else organization name).

    Returns job_title / listing_url / municipality / province when found.
    """
    org_id = org.get("id")
    name = (org.get("name") or "").strip()
    cols = "job_title, listing_url, municipality, province, organization, scraped_at"

    if org_id is not None:
        resp = (
            supabase.table("jobs")
            .select(cols)
            .eq("organization_id", org_id)
            .order("scraped_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if rows:
            return rows[0]

    if name:
        resp = (
            supabase.table("jobs")
            .select(cols)
            .eq("organization", name)
            .order("scraped_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if rows:
            return rows[0]
    return None


_FETCHERS = {
    "website": "fetch_orgs_missing_website",
    "minimal": "fetch_orgs_minimal",
    "full": "fetch_orgs_any",
}


def _fetcher_for(mode: str):
    """Resolve mode → fetch callable (looked up at call time for test patching)."""
    name = _FETCHERS[mode]
    return globals()[name]


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

    lines = [f"\n{'='*60}\n{'would update' if dry_run else 'update'} org_id={org['id']} ({org.get('name')})"]
    def add_field(label: str, old_val: Any, new_val: Any, max_len: int | None = None, is_long: bool = False) -> None:
        if new_val is None and old_val is None:
            lines.append(f"  [KEEP] {label}: (none)")
            return

        if old_val == new_val:
            val_str = _preview_text(str(old_val), max_len=max_len)
            if is_long:
                lines.append(f"  [KEEP] {label}: (unchanged, {len(str(old_val))} chars)")
            else:
                lines.append(f"  [KEEP] {label}: {val_str}")
        else:
            old_str = _preview_text(str(old_val) if old_val is not None else "(none)", max_len=max_len)
            new_str = _preview_text(str(new_val) if new_val is not None else "(none)", max_len=max_len)
            if is_long:
                lines.append(f"  [UPDATE] {label}:\n    - {old_str}\n    + {new_str}")
            else:
                lines.append(f"  [UPDATE] {label}: {old_str} -> {new_str}")

    add_field("sse", org.get("sse_rating"), updates.get("sse_rating"))
    add_field("is_sse", org.get("is_sse"), updates.get("is_sse"))
    add_field("type", org.get("type"), updates.get("type"))
    add_field("sector", org.get("sector_id"), updates.get("sector_id"))
    add_field("language", org.get("language"), updates.get("language"))
    add_field("website", org.get("website"), updates.get("website"))
    add_field("values", org.get("values_list"), updates.get("values_list"))
    add_field("mission", org.get("mission_statement"), updates.get("mission_statement"), max_len=200, is_long=True)
    add_field("description", org.get("description"), updates.get("description"), max_len=200, is_long=True)

    old_reasoning = old_details.get("reasoning")
    new_reasoning = new_details.get("reasoning")
    add_field("sse_reasoning", old_reasoning, new_reasoning, max_len=300, is_long=True)
    add_field("flags", old_details.get("flags"), new_details.get("flags"))

    logger.info("\n".join(lines))


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


def _has_admin_sse_override(org: dict) -> bool:
    """True when an admin curated SSE and full reassess must not clobber it."""
    details = org.get("sse_details")
    if not isinstance(details, dict):
        return False
    if details.get("reviewed") is True:
        return True
    flags = details.get("flags")
    if isinstance(flags, list) and "admin_override" in flags:
        return True
    return False


def _assessed_recently(org: dict, *, within: timedelta) -> bool:
    classified_at = _parse_classified_at(org)
    if classified_at is None:
        return False
    if classified_at.tzinfo is None:
        classified_at = classified_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - classified_at <= within


def _should_skip_completed(
    org: dict,
    *,
    overwrite_recent_hours: float | None,
) -> bool:
    """Skip orgs that already have classified_at, unless within overwrite window.

    Default (no overwrite_recent_hours): skip every completed assessment.
    With ``overwrite_recent_hours=N``: allow re-assess only when classified_at
    is within the last N hours; older completed rows stay skipped.
    """
    classified_at = _parse_classified_at(org)
    if classified_at is None:
        return False
    if overwrite_recent_hours is None:
        return True
    if overwrite_recent_hours <= 0:
        return True
    return not _assessed_recently(
        org, within=timedelta(hours=overwrite_recent_hours),
    )


def run(
    *,
    mode: str,
    limit: int | None,
    dry_run: bool,
    delay_seconds: float,
    after_id: int = 0,
    overwrite_recent_hours: float | None = None,
    force_reviewed: bool = False,
    force_lang: bool = False,
) -> dict:
    # Hard-require Tavily before touching any org. Soft-empty evidence led to
    # hallucinated websites when the package/key was missing in prod.
    from llm.tavily_grounding import require_tavily

    require_tavily()

    try:
        assessor = OrganizationAssessor()
    except Exception as exc:
        logger.error("OrganizationAssessor unavailable: %s", exc)
        return {"processed": 0, "updated": 0, "skipped": 0, "errors": 1, "dry_run": dry_run}

    repo = OrganizationRepository(supabase)
    processed = 0
    updated = 0
    skipped = 0
    skipped_completed = 0
    skipped_reviewed = 0
    errors = 0
    cursor = after_id
    fetch = _fetcher_for(mode)
    if after_id:
        logger.info("Resuming after org id=%s", after_id)
    if mode == "minimal":
        logger.info(
            "Mode minimal: re-assessing orgs with sse_rating IS NULL "
            "(bypasses resolver alias-cache short-circuit)"
        )
    if overwrite_recent_hours is not None and overwrite_recent_hours > 0:
        logger.info(
            "Overwriting orgs assessed within the last %s hours "
            "(older completed assessments still skipped)",
            overwrite_recent_hours,
        )
    else:
        logger.info(
            "Skipping completed assessments (sse_details.classified_at set); "
            "pass --overwrite-recent-hours N to re-do recent ones"
        )
    if mode == "full" and not force_reviewed:
        logger.info(
            "Skipping admin-reviewed orgs (sse_details.reviewed / admin_override); "
            "pass --force-reviewed to overwrite"
        )

    while limit is None or processed < limit:
        # Fixed fetch size; over-fetch when skipping completed so --limit still fills.
        batch_size = 25
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

            if _should_skip_completed(
                org, overwrite_recent_hours=overwrite_recent_hours,
            ):
                classified_at = _parse_classified_at(org)
                logger.info(
                    "skip org_id=%s (%s) — already assessed (%s)",
                    org_id,
                    name,
                    classified_at.isoformat() if classified_at else "?",
                )
                skipped_completed += 1
                continue

            if (
                mode == "full"
                and not force_reviewed
                and _has_admin_sse_override(org)
            ):
                logger.info(
                    "skip org_id=%s (%s) — admin-reviewed SSE (use --force-reviewed to overwrite)",
                    org_id,
                    name,
                )
                skipped_reviewed += 1
                continue

            processed += 1
            try:
                job = fetch_recent_job_for_org(org)
                job_title = (job or {}).get("job_title") or ""
                listing_url = (job or {}).get("listing_url") or None
                job_mun = (job or {}).get("municipality")
                job_prov = (job or {}).get("province")
                if job:
                    logger.info(
                        "org_id=%s job context: title=%r listing=%s",
                        org_id,
                        job_title,
                        listing_url,
                    )

                if mode == "website":
                    result = assessor.assess(
                        raw_name=name,
                        municipality=job_mun or org.get("municipality"),
                        province=job_prov or org.get("province"),
                        job_title=job_title,
                        description="",
                        known_website=org.get("website"),
                        existing_description=org.get("description") or "",
                        listing_notes="",
                        listing_url=listing_url,
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
                    # full + minimal: grounded reassess (SSE / type / values / …)
                    updates = assessor.assess_and_build_update(
                        org,
                        force_lang=force_lang,
                        job_title=job_title,
                        listing_url=listing_url,
                        municipality=job_mun,
                        province=job_prov,
                    )
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
        "skipped_completed": skipped_completed,
        "skipped_reviewed": skipped_reviewed,
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
    parser.add_argument("--prod", action="store_true", help="Use production database + prod LLM env.")
    parser.add_argument(
        "--publish",
        action="store_true",
        help=(
            "Use production DB credentials only; keep LLM keys from base .env "
            "(parent wev/.env). Mutually exclusive with --prod."
        ),
    )
    parser.add_argument(
        "--mode",
        choices=("website", "minimal", "full"),
        default="website",
        help=(
            "website = fill missing sites only; "
            "minimal = reassess never-assessed / minimal-fallback rows "
            "(sse_rating IS NULL); "
            "full = reassess SSE/mission/values/etc. for all orgs."
        ),
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
        "--overwrite-recent-hours",
        type=float,
        default=None,
        metavar="H",
        help=(
            "Re-assess orgs whose sse_details.classified_at is within the last H hours. "
            "By default, completed assessments are always skipped."
        ),
    )
    parser.add_argument(
        "--force-reviewed",
        action="store_true",
        help=(
            "In --mode full, overwrite orgs with admin-reviewed SSE "
            "(sse_details.reviewed / admin_override). Default: skip them. "
            "No effect in --mode minimal (those rows have no SSE yet)."
        ),
    )
    parser.add_argument(
        "--force-lang",
        action="store_true",
        help=(
            "In --mode full/minimal, recalculate and override the language "
            "even if already populated."
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
    if args.overwrite_recent_hours is not None and args.overwrite_recent_hours <= 0:
        parser.error("--overwrite-recent-hours must be > 0")

    from llm.tavily_grounding import TavilyUnavailableError

    try:
        run(
            mode=args.mode,
            limit=args.limit,
            dry_run=args.dry_run,
            delay_seconds=args.delay_seconds,
            after_id=args.after_id,
            overwrite_recent_hours=args.overwrite_recent_hours,
            force_reviewed=args.force_reviewed,
            force_lang=args.force_lang,
        )
    except TavilyUnavailableError as exc:
        logger.error("%s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
