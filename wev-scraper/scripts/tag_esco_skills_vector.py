#!/usr/bin/env python
"""Vector-based ESCO skill tagger using Jina v3 embeddings.

Per-job flow:
  1. Build job text: job_title | organization | summary | description (truncated to Jina limit)
  2. Embed with task="retrieval.query" via JinaEmbeddingService
  3. Call match_skills_by_embedding RPC → top 80 candidates
  4. Adaptive selection: floor (0.25) → top-10 cap
  5. Write all selected candidates to job_skills
  6. Write top 10 by score to jobs.skills (respects jobs_skills_max_10_check constraint)

Usage:
    python -m scripts.tag_esco_skills_vector [--dry-run] [--prod] [--backfill]
        [--job-ids ID ...] [--limit N] [--retag]
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time


# --prod confirmation before utils.db import
if "--prod" in sys.argv[1:] and os.environ.get("CONFIRM_PROD_RUN") == "YES":
    os.environ["USE_PROD_DB"] = "1"
    print("🔥 Using PRODUCTION database (confirmation skipped)")
elif "--prod" in sys.argv[1:]:
    if sys.stdin.isatty():
        print("\nWARNING: You are about to run against the PRODUCTION database.")
        print("This will modify real data.\n")
        _resp = input("Type YES to continue, anything else to abort: ")
        if _resp.strip() != "YES":
            print("Aborted.")
            sys.exit(1)
    elif os.environ.get("CONFIRM_PROD_RUN") != "YES":
        print("Refusing to run against production in non-interactive mode. Set CONFIRM_PROD_RUN=YES to override.")
        sys.exit(1)
    os.environ["USE_PROD_DB"] = "1"
    print("🔥 Using PRODUCTION database")
elif os.environ.get("USE_PROD_DB") == "1":
    print("🔥 Using PRODUCTION database (USE_PROD_DB=1)")
else:
    print("🧪 Using TEST database")

from utils.db import supabase, fetch_all_rows
from llm.jina_embedding import JinaEmbeddingService, ConfigurationError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def build_job_embedding_text(job: dict) -> str:
    """Build the embedding input text for a job.

    Concatenates available fields with ' | ' separator, omitting absent/empty ones.
    Format: {job_title} | {organization} | {summary} | {description}

    The combined text is truncated to ~32,000 chars (Jina v3's 8192-token limit
    at ~4 chars/token). Priority fields (title, org, summary) are included in full;
    only the description tail gets cut if the total exceeds the limit.

    NOTE: organization is included for industry inference. Monitor match quality
    and consider dropping it if it introduces noise on org-heavy job titles.
    """
    _JINA_CHAR_LIMIT = 32_000
    parts = []
    if job.get("job_title"):
        parts.append(job["job_title"].strip())
    if job.get("organization"):
        parts.append(job["organization"].strip())
    if job.get("summary"):
        parts.append(job["summary"].strip())
    if job.get("description"):
        parts.append(job["description"].strip())
    return " | ".join(parts)[:_JINA_CHAR_LIMIT]


def select_skills(
    candidates: list[dict],
    max_count: int = 10,
    floor: float = 0.25,
) -> tuple[list[dict], float]:
    """Two-stage adaptive skill selection.

    1. Floor filter — removes genuinely unrelated matches (absolute minimum)
    2. Top-K cap — prevents runaway results, keeps highest-confidence skills

    Args:
        candidates: Raw list of dicts with at minimum a ``score`` float field.
        max_count:  Hard cap on returned skills (default 10, matches DB constraint).
        floor:      Absolute minimum score — do NOT raise above 0.32.

    Returns:
        Tuple of (selected candidates sorted by score desc, floor used as cutoff).
    """
    above_floor = [c for c in candidates if c["score"] > floor]
    if not above_floor:
        return [], floor
    selected = sorted(above_floor, key=lambda c: c["score"], reverse=True)[:max_count]
    return selected, floor


# ---------------------------------------------------------------------------
# Per-job tagging
# ---------------------------------------------------------------------------

def _tag_single_job(
    job: dict,
    svc: JinaEmbeddingService,
    *,
    dry_run: bool,
) -> dict:
    """Tag one job. Returns a result dict with keys: job_id, inserted, top_skills, source, error."""
    job_id = job["id"]
    job_title = job.get("job_title", "?")

    result = {"job_id": job_id, "inserted": 0, "top_skills": [], "source": None, "error": None}

    # 1. Build embedding text
    text = build_job_embedding_text(job)
    if not text.strip():
        logger.warning(f"[vector-tagger] job {job_id} ({job_title}): no text to embed, skipping")
        result["error"] = "no_text"
        return result

    # 2. Embed with retry (JinaEmbeddingService handles 429/5xx internally)
    max_retries = 3
    backoff = 2.0
    embedding = None
    for attempt in range(max_retries + 1):
        try:
            embeddings = svc.embed([text], task="retrieval.query")
            embedding = embeddings[0]
            break
        except Exception as e:
            if attempt < max_retries:
                logger.warning(
                    f"[vector-tagger] job {job_id}: embed attempt {attempt + 1} failed ({e}), "
                    f"retrying in {backoff}s"
                )
                time.sleep(backoff)
                backoff *= 2
            else:
                logger.error(f"[vector-tagger] job {job_id} ({job_title}): embedding failed after {max_retries} retries — {e}")
                result["error"] = str(e)
                return result

    # 3. Call match_skills_by_embedding RPC → top 80 candidates
    try:
        rpc_resp = supabase.rpc(
            "match_skills_by_embedding",
            {"query_embedding": embedding, "match_count": 80},
        ).execute()
        candidates = [
            {
                "concept_uri": row["concept_uri"],
                "preferred_label_en": row.get("preferred_label_en", ""),
                "preferred_label_fr": row.get("preferred_label_fr", ""),
                "score": row["similarity"],
            }
            for row in (rpc_resp.data or [])
        ]
    except Exception as e:
        logger.error(f"[vector-tagger] job {job_id} ({job_title}): RPC failed — {e}")
        result["error"] = str(e)
        return result

    # 4. Adaptive skill selection (floor → cap)
    candidates_raw = candidates
    selected, cutoff = select_skills(candidates_raw)
    source = "jina-v3"

    top_score_str = f"{selected[0]['score']:.3f}" if selected else "n/a"
    print(
        f"  job {job_id[:8]}… {job_title[:40]!r}: "
        f"{len(candidates_raw)} candidates → {len(selected)} selected "
        f"(elbow cutoff: {cutoff:.3f}, top score: {top_score_str})"
    )

    if not selected:
        logger.warning(f"[vector-tagger] job {job_id} ({job_title}): zero matches after elbow selection")

    top10 = selected[:10]

    if dry_run:
        result["top_skills"] = top10
        result["source"] = source
        return result

    # 5. Insert all selected into job_skills
    if selected:
        job_skills_rows = [
            {
                "job_id": job_id,
                "skill_id": s["concept_uri"],
                "score": s["score"],
                "source": source,
            }
            for s in selected
        ]
        try:
            supabase.table("job_skills").upsert(
                job_skills_rows, on_conflict="job_id,skill_id"
            ).execute()
            result["inserted"] = len(job_skills_rows)
        except Exception as e:
            logger.error(f"[vector-tagger] job {job_id}: job_skills upsert failed — {e}")
            result["error"] = str(e)
            return result

    # 6. Write top 10 to jobs.skills (respects jobs_skills_max_10_check constraint)
    top10_uris = [s["concept_uri"] for s in top10]
    try:
        supabase.table("jobs").update({"skills": top10_uris}).eq("id", job_id).execute()
    except Exception as e:
        logger.error(f"[vector-tagger] job {job_id}: jobs.skills update failed — {e}")
        result["error"] = str(e)
        return result

    result["top_skills"] = top10
    result["source"] = source
    return result


# ---------------------------------------------------------------------------
# Main tagger
# ---------------------------------------------------------------------------

def tag_esco_skills_vector(
    *,
    job_ids: list[str] | None = None,
    dry_run: bool = False,
    retag: bool = False,
    backfill: bool = False,
    limit: int | None = None,
) -> dict:
    """Tag jobs with ESCO skills via vector similarity.

    Args:
        job_ids:  Specific job IDs to process. Mutually exclusive with backfill.
        dry_run:  Log top 5 candidates per job without writing to DB.
        retag:    Re-process jobs that already have job_skills rows.
        backfill: Process all jobs with no job_skills rows with source LIKE 'jina-v3%'.
        limit:    Cap jobs processed.

    Returns:
        Summary dict: processed, inserted, zero_match_jobs, avg_top1_score, errors.
    """
    print("=" * 70)
    print("ESCO VECTOR SKILL TAGGER")
    print("=" * 70)
    print(f"Dry run:     {'yes' if dry_run else 'no'}")
    print(f"Retag:       {'yes' if retag else 'no'}")
    print(f"Backfill:    {'yes' if backfill else 'no'}")
    print(f"Limit:       {limit if limit else 'none'}")
    print()

    # Initialize embedding service
    try:
        svc = JinaEmbeddingService()
        mode = "local (HuggingFace MPS)" if svc.is_local else "API (jina.ai)"
        print(f"✓ JinaEmbeddingService initialized — {mode}\n")
    except ConfigurationError as e:
        print(f"✗ {e}")
        return {"processed": 0, "inserted": 0, "zero_match_jobs": 0, "avg_top1_score": 0.0, "errors": 1}

    # Fetch jobs
    columns = "id, job_title, organization, summary, description"
    try:
        if job_ids:
            resp = supabase.table("jobs").select(columns).in_("id", job_ids).execute()
            jobs = resp.data or []
        elif backfill and retag:
            # Retag all jobs (ignore existing job_skills rows)
            jobs = fetch_all_rows("jobs", columns, order_by="id", desc=True)
        elif backfill:
            # Jobs with no jina-v3 rows in job_skills
            jobs = _fetch_jobs_for_backfill(columns)
        else:
            jobs = fetch_all_rows("jobs", columns, order_by="id", desc=True)

        if not retag and not backfill and not job_ids:
            # Default: skip jobs that already have jina-v3 job_skills rows
            jobs = _filter_untagged_jobs(jobs)

    except Exception as e:
        print(f"✗ Failed to fetch jobs: {e}")
        return {"processed": 0, "inserted": 0, "zero_match_jobs": 0, "avg_top1_score": 0.0, "errors": 1}

    if limit:
        jobs = jobs[:limit]

    total = len(jobs)
    print(f"Jobs to process: {total}\n")

    if total == 0:
        print("Nothing to do.")
        return {"processed": 0, "inserted": 0, "zero_match_jobs": 0, "avg_top1_score": 0.0, "errors": 0}

    # Process jobs
    processed = 0
    total_inserted = 0
    zero_match_jobs = 0
    top1_scores: list[float] = []
    errors = 0
    start_time = time.time()

    for job in jobs:
        result = _tag_single_job(job, svc, dry_run=dry_run)

        if result["error"]:
            errors += 1
        else:
            processed += 1
            total_inserted += result["inserted"]
            if not result["top_skills"]:
                zero_match_jobs += 1
            else:
                top1_scores.append(result["top_skills"][0]["score"])

    elapsed = time.time() - start_time
    avg_top1 = sum(top1_scores) / len(top1_scores) if top1_scores else 0.0

    print()
    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"  Jobs processed       : {processed}")
    print(f"  job_skills inserted  : {total_inserted}")
    print(f"  Avg top-1 similarity : {avg_top1:.3f}")
    print(f"  Jobs with 0 matches  : {zero_match_jobs}")
    print(f"  Errors               : {errors}")
    print(f"  Elapsed              : {elapsed:.1f}s")
    if dry_run:
        print("  (dry-run — no DB writes)")
    print()

    return {
        "processed": processed,
        "inserted": total_inserted,
        "zero_match_jobs": zero_match_jobs,
        "avg_top1_score": avg_top1,
        "errors": errors,
    }


def _fetch_jobs_for_backfill(columns: str) -> list[dict]:
    """Fetch jobs that have no job_skills rows with source LIKE 'jina-v3%'."""
    # Get all job IDs that already have jina-v3 rows
    tagged_ids: set[str] = set()
    offset = 0
    page_size = 1000
    while True:
        resp = (
            supabase.table("job_skills")
            .select("job_id")
            .like("source", "jina-v3%")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = resp.data or []
        for row in batch:
            tagged_ids.add(row["job_id"])
        if len(batch) < page_size:
            break
        offset += page_size

    # Fetch all jobs and exclude already-tagged ones
    all_jobs = fetch_all_rows("jobs", columns, order_by="id", desc=True)
    return [j for j in all_jobs if j["id"] not in tagged_ids]


def _filter_untagged_jobs(jobs: list[dict]) -> list[dict]:
    """Remove jobs that already have jina-v3 job_skills rows."""
    if not jobs:
        return jobs
    job_ids = [j["id"] for j in jobs]
    tagged_ids: set[str] = set()
    # Batch the IN query to avoid URL length limits
    batch_size = 200
    for i in range(0, len(job_ids), batch_size):
        batch = job_ids[i : i + batch_size]
        resp = (
            supabase.table("job_skills")
            .select("job_id")
            .in_("job_id", batch)
            .like("source", "jina-v3%")
            .execute()
        )
        for row in (resp.data or []):
            tagged_ids.add(row["job_id"])
    return [j for j in jobs if j["id"] not in tagged_ids]


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Tag ESCO skills via Jina v3 vector embeddings")
    parser.add_argument("--dry-run", action="store_true", help="Log candidates without writing to DB")
    parser.add_argument("--prod", action="store_true", help="Target production DB (handled at module load)")
    parser.add_argument("--retag", action="store_true", help="Re-process jobs that already have job_skills rows")
    parser.add_argument("--backfill", action="store_true", help="Process all jobs with no jina-v3 job_skills rows")
    parser.add_argument("--job-ids", nargs="+", metavar="ID", help="Process specific job IDs")
    parser.add_argument("--limit", type=int, default=None, help="Cap jobs processed")
    args = parser.parse_args()

    tag_esco_skills_vector(
        job_ids=args.job_ids,
        dry_run=args.dry_run,
        retag=args.retag,
        backfill=args.backfill,
        limit=args.limit,
    )


if __name__ == "__main__":
    main()
