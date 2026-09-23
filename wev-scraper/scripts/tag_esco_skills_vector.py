#!/usr/bin/env python
"""Vector-based ESCO skill tagger using Jina v3 embeddings.

Per-job flow:
  1. Read LLM-extracted skill phrases from jobs.skills_raw
  2. Embed phrases (batched) with task="retrieval.query" via JinaEmbeddingService
  3. Call match_skills_by_embedding → best 1 ESCO match per phrase
  4. Keep matches above similarity floor (default 0.40), cap at 50 (DB sanity ceiling)
  5. Upsert selected rows to job_skills (with score)
  6. Mirror URIs onto jobs.skills

Usage:
    python -m scripts.tag_esco_skills_vector [--dry-run] [--prod|--publish] [--backfill]
        [--job-ids ID ...] [--limit N] [--retag] [--workers N]
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Load env before any DB import. Mirror unified_post_processor.py: always load
# .env, then if --prod is set, override with .env.production so SUPABASE_URL /
# SUPABASE_SECRET_KEY point at prod. We can't rely on dotenv-cli at the
# npm layer because it is first-wins (won't override .env values).
from settings import ensure_env_loaded, load_env_file  # noqa: E402

ensure_env_loaded()
_has_prod = "--prod" in sys.argv[1:]
_has_publish = "--publish" in sys.argv[1:]
if _has_prod or _has_publish:
    _root = Path(__file__).resolve().parent.parent.parent
    _scraper = Path(__file__).resolve().parent.parent
    _prod_env = (
        _root / ".env.production"
        if (_root / ".env.production").exists()
        else _scraper / ".env.production"
    )
    if not _prod_env.exists():
        print(f"❌ {_prod_env} not found — required for --prod/--publish.", file=sys.stderr)
        sys.exit(1)
    load_env_file(_prod_env)
    if _has_prod:
        # Full prod: use Jina API (JINA_API_KEY) instead of local torch.
        os.environ["ENV_MODE"] = "prod"
        print("▶ LLM/embed routing: ENV_MODE=prod (Jina API, not local torch)")
    else:
        # Publish: prod DB credentials but keep ENV_MODE=local for local embeddings.
        os.environ["ENV_MODE"] = "local"
        print("▶ LLM/embed routing: ENV_MODE=local (--publish → local HuggingFace Jina)")

# --prod confirmation before utils.db import
if (_has_prod or _has_publish) and os.environ.get("CONFIRM_PROD_RUN") == "YES":
    os.environ["USE_PROD_DB"] = "1"
    print("🔥 Using PRODUCTION database (confirmation skipped)")
elif _has_prod or _has_publish:
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

# Deferred imports: `utils.db` and `JinaEmbeddingService` (and their dependencies)
# read Supabase / Jina config from `os.environ` as soon as they load. They must run
# only after `ensure_env_loaded()`, optional `.env.production`, and the --prod gate
# above. noqa: E402 tells ruff/flake8 to allow imports after executable code.
from llm.jina_embedding import (  # noqa: E402
    MAX_API_EMBEDDING_INPUT_CHARS,
    ConfigurationError,
    JinaEmbeddingService,
)
from utils.db import fetch_all_rows, supabase  # noqa: E402

logger = logging.getLogger(__name__)


def select_skills(
    candidates: list[dict],
    combined_floor: float = 0.40,
) -> tuple[list[dict], float]:
    """Select skills by similarity confidence.

    Returns all candidates above the floor, sorted by descending score,
    capped at 50 (the DB constraint limit). A floor of 0.40 balances
    recall vs. noise for cosine similarity between short extracted
    phrases and ESCO skill labels.
    """
    above_floor = [c for c in candidates if c["score"] > combined_floor]
    if not above_floor:
        return [], combined_floor
    selected = sorted(above_floor, key=lambda c: c["score"], reverse=True)[:50]
    return selected, combined_floor


def replace_job_skills(job_id: str, rows: list[dict]) -> None:
    """Replace ``job_skills`` for *job_id* without stranding an empty junction.

    Upserts the new set first, then deletes skill_ids not in that set. A failed
    upsert leaves prior rows intact. Passing an empty *rows* clears all tags.
    """
    if not rows:
        supabase.table("job_skills").delete().eq("job_id", job_id).execute()
        return
    keep_ids = [r["skill_id"] for r in rows]
    supabase.table("job_skills").upsert(rows, on_conflict="job_id,skill_id").execute()
    (
        supabase.table("job_skills")
        .delete()
        .eq("job_id", job_id)
        .not_.in_("skill_id", keep_ids)
        .execute()
    )


def _is_transient_supabase_error(exc: BaseException) -> bool:
    """True for HTTP/2 / connection drops that usually succeed on retry.

    Seen under parallel workers sharing one PostgREST client: ConnectionTerminated
    (error_code 9 = CANCEL), Server disconnected, SSL EOF, and bare numeric
    h2 error codes when the exception stringifies poorly.
    """
    msg = str(exc).strip().lower()
    if msg.isdigit():
        return True
    needles = (
        "connectionterminated",
        "server disconnected",
        "connection reset",
        "remotely closed",
        "broken pipe",
        "eof occurred",
        "ssl",
        "goaway",
        "timed out",
        "timeout",
        "temporarily unavailable",
        "503",
        "502",
        "504",
    )
    return any(n in msg for n in needles)


def _with_supabase_retries(op, *, label: str, max_retries: int = 4):
    """Run a Supabase call with backoff on transient connection failures."""
    backoff = 0.75
    last_exc: BaseException | None = None
    for attempt in range(max_retries + 1):
        try:
            return op()
        except Exception as e:
            last_exc = e
            if attempt >= max_retries or not _is_transient_supabase_error(e):
                raise
            logger.warning(
                f"[vector-tagger] {label}: transient error ({e!r}), "
                f"retry {attempt + 1}/{max_retries} in {backoff:.1f}s"
            )
            time.sleep(backoff)
            backoff = min(backoff * 2, 8.0)
    assert last_exc is not None
    raise last_exc


# ---------------------------------------------------------------------------
# Main tagger
# ---------------------------------------------------------------------------

def _match_and_write_job(
    *,
    job: dict,
    valid_phrases: list[str],
    embeddings: list[list[float]],
    dry_run: bool,
    print_lock: threading.Lock,
) -> dict:
    """Match one job's phrase embeddings to ESCO and write job_skills.

    Returns a stats dict: processed, inserted, zero_match, top1_score, error.
    Embeddings are assumed already computed (local MPS stays single-threaded).
    """
    job_id = job["id"]
    job_title = job.get("job_title", "?")
    best_candidates: dict[str, dict] = {}

    try:
        query_embeddings = [f"[{','.join(map(str, emb))}]" for emb in embeddings]

        def _rpc():
            return supabase.rpc(
                "match_skills_by_embedding",
                {"query_embeddings": query_embeddings, "match_count": 1},
            ).execute()

        rpc_resp = _with_supabase_retries(_rpc, label=f"job {job_id} match RPC")

        for row in (rpc_resp.data or []):
            uri = row["concept_uri"]
            score = row["similarity"]
            if uri not in best_candidates or score > best_candidates[uri]["score"]:
                best_candidates[uri] = {
                    "concept_uri": uri,
                    "preferred_label_en": row.get("preferred_label_en", ""),
                    "preferred_label_fr": row.get("preferred_label_fr", ""),
                    "score": score,
                    "matched_phrase": "...",
                }
    except Exception as e:
        logger.error(f"[vector-tagger] job {job_id} ({job_title}): batch RPC failed — {e!r}")
        return {"processed": 0, "inserted": 0, "zero_match": 0, "top1_score": None, "error": 1}

    candidates_raw = list(best_candidates.values())
    selected, cutoff = select_skills(candidates_raw)
    source = "jina-v3"

    top_score_str = f"{selected[0]['score']:.3f}" if selected else "n/a"
    with print_lock:
        print(
            f"  job {job_id[:8]}… {job_title[:40]!r}: "
            f"{len(valid_phrases)} phrases → {len(candidates_raw)} unique ESCO hits → {len(selected)} selected "
            f"(floor: {cutoff:.3f}, top score: {top_score_str})"
        )

    zero_match = 0
    top1_score = None
    if not selected:
        logger.warning(f"[vector-tagger] job {job_id} ({job_title}): zero matches after elbow selection")
        zero_match = 1
    else:
        top1_score = selected[0]["score"]

    top50 = selected[:50]

    if dry_run:
        return {
            "processed": 1,
            "inserted": 0,
            "zero_match": zero_match,
            "top1_score": top1_score,
            "error": 0,
        }

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
            _with_supabase_retries(
                lambda: replace_job_skills(job_id, job_skills_rows),
                label=f"job {job_id} replace job_skills",
            )
            inserted = len(job_skills_rows)
        except Exception as e:
            logger.error(f"[vector-tagger] job {job_id}: job_skills replace failed — {e!r}")
            return {"processed": 0, "inserted": 0, "zero_match": zero_match, "top1_score": top1_score, "error": 1}
    else:
        try:
            _with_supabase_retries(
                lambda: replace_job_skills(job_id, []),
                label=f"job {job_id} clear job_skills",
            )
            inserted = 0
        except Exception as e:
            logger.error(f"[vector-tagger] job {job_id}: job_skills clear failed — {e!r}")
            return {"processed": 0, "inserted": 0, "zero_match": zero_match, "top1_score": top1_score, "error": 1}

    top50_uris = [s["concept_uri"] for s in top50]
    try:
        _with_supabase_retries(
            lambda: supabase.table("jobs").update({"skills": top50_uris}).eq("id", job_id).execute(),
            label=f"job {job_id} update jobs.skills",
        )
    except Exception as e:
        logger.error(f"[vector-tagger] job {job_id}: jobs.skills update failed — {e!r}")
        return {"processed": 0, "inserted": inserted, "zero_match": zero_match, "top1_score": top1_score, "error": 1}

    return {
        "processed": 1,
        "inserted": inserted,
        "zero_match": zero_match,
        "top1_score": top1_score,
        "error": 0,
    }


def tag_esco_skills_vector(
    *,
    job_ids: list[str] | None = None,
    dry_run: bool = False,
    retag: bool = False,
    backfill: bool = False,
    limit: int | None = None,
    workers: int = 4,
) -> dict:
    """Tag jobs with ESCO skills via vector similarity in batches.

    Args:
        job_ids:  Specific job IDs to process. Mutually exclusive with backfill.
        dry_run:  Log top candidates per job without writing to DB.
        retag:    Re-process jobs that already have job_skills rows.
        backfill: Process all jobs with no job_skills rows with source LIKE 'jina-v3%'.
        limit:    Cap jobs processed.
        workers:  Parallel threads for match RPC + DB writes (embeddings stay serial).

    Returns:
        Summary dict: processed, inserted, zero_match_jobs, avg_top1_score, errors.
    """
    workers = max(1, int(workers))
    print("=" * 70)
    print("ESCO VECTOR SKILL TAGGER (BATCHED)")
    print("=" * 70)
    print(f"Dry run:     {'yes' if dry_run else 'no'}")
    print(f"Retag:       {'yes' if retag else 'no'}")
    print(f"Backfill:    {'yes' if backfill else 'no'}")
    print(f"Limit:       {limit if limit else 'none'}")
    print(f"Workers:     {workers} (match/write; embed serial)")
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
    columns = "id, job_title, organization, summary, description, skills_raw"
    try:
        if job_ids:
            jobs = []
            chunk_size = 100
            for i in range(0, len(job_ids), chunk_size):
                chunk = job_ids[i:i + chunk_size]
                resp = supabase.table("jobs").select(columns).in_("id", chunk).execute()
                if resp.data:
                    jobs.extend(resp.data)
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

    start_time = time.time()

    # 1. Collect all phrases across all jobs
    jobs_with_phrases = []
    all_phrases = []
    jobs_cleared_no_phrases = 0

    for job in jobs:
        skills_raw = job.get("skills_raw")
        valid_phrases: list[str] = []
        if isinstance(skills_raw, list):
            valid_phrases = [str(s).strip() for s in skills_raw if str(s).strip()]

        if not valid_phrases:
            # On --retag, clear stale junction/tags for phrase-less jobs so old
            # whole-job embedding mistags do not survive extract→tag gaps.
            if retag and not dry_run:
                job_id = job["id"]
                try:
                    _with_supabase_retries(
                        lambda jid=job_id: replace_job_skills(jid, []),
                        label=f"job {job_id} clear job_skills (no phrases)",
                    )
                    _with_supabase_retries(
                        lambda jid=job_id: supabase.table("jobs")
                        .update({"skills": []})
                        .eq("id", jid)
                        .execute(),
                        label=f"job {job_id} clear jobs.skills (no phrases)",
                    )
                    jobs_cleared_no_phrases += 1
                except Exception as e:
                    logger.error(
                        f"[vector-tagger] job {job_id}: clear on empty skills_raw failed — {e!r}"
                    )
            continue

        start_idx = len(all_phrases)
        all_phrases.extend(valid_phrases)
        end_idx = len(all_phrases)

        jobs_with_phrases.append({
            "job": job,
            "phrases": valid_phrases,
            "start_idx": start_idx,
            "end_idx": end_idx
        })

    print(f"Collected {len(all_phrases)} phrases across {len(jobs_with_phrases)} jobs.")
    if jobs_cleared_no_phrases:
        print(f"Cleared stale tags on {jobs_cleared_no_phrases} retag jobs with no skills_raw phrases.")

    if not jobs_with_phrases:
        print("No jobs with skills_raw phrases — nothing to embed.")
        return {
            "processed": jobs_cleared_no_phrases,
            "inserted": 0,
            "zero_match_jobs": 0,
            "avg_top1_score": 0.0,
            "errors": 0,
        }

    # 2. Embed all phrases in batches
    # We can batch the embeddings into chunks to avoid passing too many to the API or model at once.
    CHUNK_SIZE = 500
    all_embeddings = []
    
    for i in range(0, len(all_phrases), CHUNK_SIZE):
        chunk = all_phrases[i:i + CHUNK_SIZE]
        max_retries = 3
        backoff = 2.0
        for attempt in range(max_retries + 1):
            try:
                print(f"Embedding chunk {i} to {i + len(chunk)}...")
                chunk_embeddings = svc.embed(chunk, task="retrieval.query")
                all_embeddings.extend(chunk_embeddings)
                break
            except Exception as e:
                if attempt < max_retries:
                    logger.warning(f"Embed attempt {attempt + 1} failed ({e}), retrying in {backoff}s")
                    time.sleep(backoff)
                    backoff *= 2
                else:
                    logger.error(f"Embedding failed after {max_retries} retries — {e}")
                    return {"processed": 0, "inserted": 0, "zero_match_jobs": 0, "avg_top1_score": 0.0, "errors": 1}

    # 3. Match + write per job (I/O-bound — parallelize across workers).
    # Local Jina/MPS embedding above stays serial; concurrency is for Supabase RPC/writes.
    processed = 0
    total_inserted = 0
    zero_match_jobs = 0
    top1_scores: list[float] = []
    errors = 0
    print_lock = threading.Lock()
    done = 0
    total_jobs = len(jobs_with_phrases)

    def _run_one(item: dict) -> dict:
        return _match_and_write_job(
            job=item["job"],
            valid_phrases=item["phrases"],
            embeddings=all_embeddings[item["start_idx"] : item["end_idx"]],
            dry_run=dry_run,
            print_lock=print_lock,
        )

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_run_one, item): item for item in jobs_with_phrases}
        for fut in as_completed(futures):
            try:
                stats = fut.result()
            except Exception as e:
                item = futures[fut]
                jid = item["job"]["id"]
                logger.error(f"[vector-tagger] job {jid}: unexpected worker failure — {e}")
                errors += 1
                done += 1
                continue

            processed += stats["processed"]
            total_inserted += stats["inserted"]
            zero_match_jobs += stats["zero_match"]
            errors += stats["error"]
            if stats["top1_score"] is not None:
                top1_scores.append(stats["top1_score"])
            done += 1
            if done % 50 == 0 or done == total_jobs:
                with print_lock:
                    print(f"  … progress {done}/{total_jobs} jobs")

    elapsed = time.time() - start_time
    avg_top1 = sum(top1_scores) / len(top1_scores) if top1_scores else 0.0
    processed += jobs_cleared_no_phrases

    print()
    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"  Jobs processed       : {processed}")
    if jobs_cleared_no_phrases:
        print(f"    (cleared no-phrase): {jobs_cleared_no_phrases}")
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
    parser.add_argument("--prod", action="store_true", help="Target production DB with remote Jina API")
    parser.add_argument("--publish", action="store_true", help="Target production DB with local Jina embeddings")
    parser.add_argument("--retag", action="store_true", help="Re-process jobs that already have job_skills rows")
    parser.add_argument("--backfill", action="store_true", help="Process all jobs with no jina-v3 job_skills rows")
    parser.add_argument("--job-ids", nargs="+", metavar="ID", help="Process specific job IDs")
    parser.add_argument("--limit", type=int, default=None, help="Cap jobs processed")
    parser.add_argument(
        "--workers",
        type=int,
        default=int(os.environ.get("TAG_ESCO_WORKERS", "4")),
        help="Parallel threads for match RPC + DB writes (default: 4, or TAG_ESCO_WORKERS)",
    )
    args = parser.parse_args()

    tag_esco_skills_vector(
        job_ids=args.job_ids,
        dry_run=args.dry_run,
        retag=args.retag,
        backfill=args.backfill,
        limit=args.limit,
        workers=args.workers,
    )


if __name__ == "__main__":
    main()
