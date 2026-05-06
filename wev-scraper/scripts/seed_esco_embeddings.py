#!/usr/bin/env python
"""Seed ESCO skill embeddings using Jina v3.

Fetches skills from esco_skills where embedding IS NULL (or all with --retag),
embeds them in batches of 128 via JinaEmbeddingService, and upserts the vectors
back to esco_skills.embedding keyed on concept_uri.

Usage:
    python -m scripts.seed_esco_embeddings [--dry-run] [--prod] [--retag] [--limit N]
"""

from __future__ import annotations

import argparse
import os
import sys
import time

# Ensure wev-scraper root is on sys.path when run directly

# --prod confirmation — must happen before utils.db is imported (which reads USE_PROD_DB)
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

# USE_PROD_DB must be set before importing utils.db, which creates the Supabase client at module load time.
from llm.jina_embedding import (  # noqa: E402
    MAX_API_EMBEDDING_INPUT_CHARS,
    ConfigurationError,
    JinaEmbeddingService,
)
from utils.db import fetch_all_rows, supabase  # noqa: E402

# ---------------------------------------------------------------------------
# Text builder
# ---------------------------------------------------------------------------

def build_skill_embedding_text(skill: dict) -> str:
    """Build the embedding input text for an ESCO skill.

    Concatenates available fields with ' | ' separator, omitting any that are
    absent or empty. Truncated to :data:`MAX_API_EMBEDDING_INPUT_CHARS` (see
    :mod:`llm.jina_embedding` — API limit is tokens, not characters).

    Format: {preferred_label_en} | {preferred_label_fr} | {description_en} | {scope_note_en}
    """
    parts = []
    if skill.get("preferred_label_en"):
        parts.append(skill["preferred_label_en"].strip())
    if skill.get("preferred_label_fr"):
        parts.append(skill["preferred_label_fr"].strip())
    if skill.get("description_en"):
        parts.append(skill["description_en"].strip())
    if skill.get("scope_note_en"):
        parts.append(skill["scope_note_en"].strip())
    return " | ".join(parts)[:MAX_API_EMBEDDING_INPUT_CHARS]


# ---------------------------------------------------------------------------
# Main seeder
# ---------------------------------------------------------------------------

def seed_esco_embeddings(
    *,
    dry_run: bool = False,
    retag: bool = False,
    limit: int | None = None,
) -> dict:
    """Embed all unembedded ESCO skills and upsert vectors to the DB.

    Args:
        dry_run: Fetch and batch but do not call the Jina API or write to DB.
        retag:   Re-embed skills even if embedding IS NOT NULL.
        limit:   Cap the number of skills processed.

    Returns:
        Summary dict with keys: processed, api_calls, elapsed, errors.
    """
    print("=" * 70)
    print("ESCO SKILL SEEDER")
    print("=" * 70)
    print(f"Dry run:  {'yes' if dry_run else 'no'}")
    print(f"Retag:    {'yes (re-embed all)' if retag else 'no (skip already embedded)'}")
    print(f"Limit:    {limit if limit else 'none'}")
    print()

    # Initialize embedding service (fails fast if JINA_API_KEY missing in API mode)
    try:
        svc = JinaEmbeddingService()
        mode = "local (HuggingFace MPS)" if svc.is_local else "API (jina.ai)"
        print(f"✓ JinaEmbeddingService initialized — {mode}")
    except ConfigurationError as e:
        print(f"✗ {e}")
        return {"processed": 0, "api_calls": 0, "elapsed": 0.0, "errors": 1}

    # Fetch skills
    print("\nFetching skills from esco_skills...")
    try:
        columns = "concept_uri, preferred_label_en, preferred_label_fr, description_en, scope_note_en"
        if retag:
            skills = fetch_all_rows("esco_skills", columns, order_by="concept_uri")
        else:
            # Supabase client doesn't support IS NULL via fetch_all_rows filters dict,
            # so we use a raw query with .is_() filter
            all_skills: list[dict] = []
            offset = 0
            page_size = 1000
            while True:
                resp = (
                    supabase.table("esco_skills")
                    .select(columns)
                    .is_("embedding", "null")
                    .order("concept_uri")
                    .range(offset, offset + page_size - 1)
                    .execute()
                )
                batch = resp.data or []
                all_skills.extend(batch)
                if len(batch) < page_size:
                    break
                offset += page_size
            skills = all_skills
    except Exception as e:
        print(f"✗ Failed to fetch skills: {e}")
        return {"processed": 0, "api_calls": 0, "elapsed": 0.0, "errors": 1}

    if limit:
        skills = skills[:limit]

    total = len(skills)
    print(f"Found {total} skill(s) to embed\n")

    if total == 0:
        print("Nothing to do.")
        return {"processed": 0, "api_calls": 0, "elapsed": 0.0, "errors": 0}

    # Batch and embed
    batch_size = JinaEmbeddingService.BATCH_SIZE  # 128
    batches = [skills[i : i + batch_size] for i in range(0, total, batch_size)]

    processed = 0
    api_calls = 0
    errors = 0
    start_time = time.time()

    for batch_idx, batch in enumerate(batches, 1):
        texts = [build_skill_embedding_text(s) for s in batch]

        if dry_run:
            print(
                f"  [dry-run] Batch {batch_idx}/{len(batches)}: "
                f"would embed {len(batch)} skills (skipping API call)"
            )
            processed += len(batch)
            continue

        # Embed with retry — JinaEmbeddingService handles 429 / 5xx internally.
        # We add one outer retry layer here to catch any unexpected errors and
        # continue rather than aborting the whole run.
        try:
            embeddings = svc.embed(texts, task="retrieval.passage")
            api_calls += 1
        except Exception as e:
            print(f"  ✗ Batch {batch_idx}/{len(batches)}: embedding failed — {e}")
            errors += len(batch)
            continue

        # Bulk-update embeddings via RPC, chunked to stay within statement timeout
        # (128 rows × 1024 floats is too slow in one shot; 20 rows ~1.5s is safe)
        _DB_CHUNK = 10
        _MAX_RETRIES = 3
        pairs = list(zip(batch, embeddings, strict=True))
        batch_errors = 0
        for i in range(0, len(pairs), _DB_CHUNK):
            chunk = pairs[i : i + _DB_CHUNK]
            updates = [{"uri": skill["concept_uri"], "emb": emb} for skill, emb in chunk]
            for attempt in range(_MAX_RETRIES):
                try:
                    supabase.rpc("bulk_update_skill_embeddings", {"updates": updates}).execute()
                    break
                except Exception:
                    if attempt < _MAX_RETRIES - 1:
                        time.sleep(2 ** attempt)
                    else:
                        batch_errors += len(chunk)
        if batch_errors:
            print(f"  ✗ Batch {batch_idx}/{len(batches)}: {batch_errors} skill(s) failed DB update after retries")
            errors += batch_errors

        processed += len(batch)
        elapsed = time.time() - start_time
        print(
            f"  Batch {batch_idx}/{len(batches)}: "
            f"{processed}/{total} skills embedded  "
            f"({elapsed:.1f}s elapsed)"
        )

    elapsed = time.time() - start_time
    print()
    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"  Total processed : {processed}")
    print(f"  API calls made  : {api_calls}")
    print(f"  Elapsed         : {elapsed:.1f}s")
    print(f"  Errors          : {errors}")
    if dry_run:
        print("  (dry-run — no DB writes)")
    print()

    return {"processed": processed, "api_calls": api_calls, "elapsed": elapsed, "errors": errors}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed ESCO skill embeddings via Jina v3"
    )
    parser.add_argument("--dry-run", action="store_true", help="Fetch and batch but skip API calls and DB writes")
    parser.add_argument("--prod", action="store_true", help="Target production DB (handled at module load)")
    parser.add_argument("--retag", action="store_true", help="Re-embed skills even if embedding IS NOT NULL")
    parser.add_argument("--limit", type=int, default=None, help="Cap number of skills processed")
    args = parser.parse_args()

    seed_esco_embeddings(
        dry_run=args.dry_run,
        retag=args.retag,
        limit=args.limit,
    )


if __name__ == "__main__":
    main()
