#!/usr/bin/env python
"""Dry-run: same org + job through each SSE-chain backend; compare outputs.

Fetches one organization and one job from production, injects shared Tavily
evidence once, then forces each model in isolation:

  gemini-3.6-flash → gemini-3.5-flash-lite → groq → ollama

Never writes to Supabase. Never walks the live fallback chain mid-call.

Usage:
  CONFIRM_PROD_RUN=YES python scripts/compare_models_org_job.py --prod
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from settings import ensure_env_loaded, load_db_credentials_only  # noqa: E402
from utils.prod_env import (  # noqa: E402
    confirm_prod_run,
    mark_prod_confirmed,
    resolve_prod_env_path,
)

ensure_env_loaded()
if "--prod" in sys.argv[1:]:
    confirm_prod_run(full_prod=True)
    mark_prod_confirmed()
    applied = load_db_credentials_only(resolve_prod_env_path(Path(__file__)))
    os.environ["USE_PROD_DB"] = "1"
    os.environ["ENV_MODE"] = "prod"
    # Prefer an active Gemini key from staging when base .env has it commented out.
    if not (os.environ.get("GEMINI_API_KEY") or "").strip():
        from dotenv import dotenv_values

        staging = Path(__file__).resolve().parents[2] / ".env.staging"
        if staging.exists():
            key = (dotenv_values(staging).get("GEMINI_API_KEY") or "").strip()
            if key:
                os.environ["GEMINI_API_KEY"] = key
                print("Loaded GEMINI_API_KEY from .env.staging")
    print(f"PRODUCTION DB (read-only); keys={', '.join(applied) or '(none)'}")
else:
    print("TEST DB (read-only)")

# Prefer a capable local model for parity checks (0.5b times out on org prompts).
if not (os.environ.get("LOCAL_LLM_MODEL") or "").strip() or "0.5b" in (
    os.environ.get("LOCAL_LLM_MODEL") or ""
):
    os.environ["LOCAL_LLM_MODEL"] = "llama3.2:3b"
os.environ.setdefault("LOCAL_LLM_CALL_TIMEOUT_SEC", "180")
os.environ.setdefault("OLLAMA_MAX_PROMPT_CHARS", "8000")
os.environ.setdefault("TAVILY_OLLAMA_MAX_CHARS", "1200")

from llm.gemini import GeminiProvider  # noqa: E402
from llm.gemini_fallback import (  # noqa: E402
    DEFAULT_GEMINI_LITE,
    DEFAULT_GEMINI_PRIMARY,
)
from llm.groq import GroqProvider  # noqa: E402
from llm.local_grounded import LocalGroundedProvider  # noqa: E402
from llm.tavily_grounding import (  # noqa: E402
    entity_require_terms,
    fetch_tavily_context,
    inject_grounding_evidence,
)
from utils.db import reset_supabase_client_cache, supabase  # noqa: E402
from utils.organization_assessment import (  # noqa: E402
    OrganizationAssessor,
    _apply_website_known_guard,
    _attach_org_language,
    _build_assessment_prompt,
    _build_search_query,
    _ASSESSOR_SYSTEM,
    _parse_response,
    _result_to_db_fields,
)
from utils.organization_cache import evidence_domain, extract_domain  # noqa: E402
from utils.sse_classifier import SSEClassifier  # noqa: E402
from utils.sse_prompts import get_sse_classification_prompt  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("compare_models")

_TOKEN_RE = re.compile(r"[a-z0-9àâäæçéèêëïîôœùûüÿ]+", re.I)

ORG_CATEGORICAL = ("is_sse", "sse_rating", "sector_id", "language", "type", "website_norm")
JOB_CATEGORICAL = ("is_sse", "sse_rating", "language")
ORG_TEXT = ("mission", "description", "values")
JOB_TEXT = ("reasoning", "summary_ref")


def _tokens(text: str) -> set[str]:
    return {t for t in _TOKEN_RE.findall((text or "").lower()) if len(t) > 2}


def semantic_score(a: Any, b: Any) -> int:
    """0/1/2 paraphrase score for free-text fields."""
    sa = " | ".join(map(str, a)) if isinstance(a, list) else str(a or "").strip().lower()
    sb = " | ".join(map(str, b)) if isinstance(b, list) else str(b or "").strip().lower()
    sa, sb = re.sub(r"\s+", " ", sa), re.sub(r"\s+", " ", sb)
    if not sa and not sb:
        return 2
    if not sa or not sb:
        return 0
    if sa == sb:
        return 2
    ta, tb = _tokens(sa), _tokens(sb)
    if not ta or not tb:
        return 0
    overlap = ta & tb
    jaccard = len(overlap) / len(ta | tb)
    recall = len(overlap) / len(ta)
    precision = len(overlap) / len(tb)
    if jaccard >= 0.28 or (recall >= 0.40 and precision >= 0.35):
        return 2
    if jaccard >= 0.12 or recall >= 0.22:
        return 1
    return 0


def _providers() -> list[tuple[str, Any]]:
    out: list[tuple[str, Any]] = []
    for name, factory in [
        (DEFAULT_GEMINI_PRIMARY, lambda: GeminiProvider(model=DEFAULT_GEMINI_PRIMARY)),
        (DEFAULT_GEMINI_LITE, lambda: GeminiProvider(model=DEFAULT_GEMINI_LITE)),
        ("groq", lambda: GroqProvider()),
        ("ollama", lambda: LocalGroundedProvider()),
    ]:
        try:
            p = factory()
            if p.is_available():
                out.append((name, p))
            else:
                logger.warning("skip %s (unavailable)", name)
        except Exception as exc:
            logger.warning("skip %s (%s)", name, exc)
    return out


def fetch_org(org_id: int) -> dict:
    cols = (
        "id,name,municipality,province,website,description,description_en,"
        "mission_statement,mission_statement_en,sse_rating,is_sse,type,sector_id,"
        "language,values_list,values,sse_details"
    )
    rows = supabase.table("organizations").select(cols).eq("id", org_id).limit(1).execute().data
    if not rows:
        raise SystemExit(f"org id={org_id} not found")
    return rows[0]


def fetch_job(job_id: str) -> dict:
    cols = (
        "id,job_title,organization,organization_id,location,municipality,province,"
        "wage,description,summary,sse_rating,is_sse,language,values,listing_url,"
        "date_posted,sse_details"
    )
    rows = supabase.table("jobs").select(cols).eq("id", job_id).limit(1).execute().data
    if not rows:
        raise SystemExit(f"job id={job_id} not found")
    return rows[0]


def _org_is_complete(row: dict) -> bool:
    return bool(
        row.get("sse_rating") is not None
        and row.get("is_sse") is not None
        and (row.get("sector_id") or "").strip()
        and (row.get("language") or "").strip()
        and (row.get("type") or "").strip()
        and (row.get("website") or "").strip()
        and (
            (row.get("description_en") or row.get("description") or "").strip()
        )
    )


def _job_is_complete(row: dict) -> bool:
    desc = (row.get("description") or "").strip()
    return bool(
        row.get("sse_rating") is not None
        and row.get("is_sse") is not None
        and (row.get("language") or "").strip()
        and (row.get("organization") or "").strip()
        and len(desc) >= 500
    )


def pick_random_complete(*, exclude_org_ids: set[int] | None = None, exclude_job_ids: set[str] | None = None) -> tuple[dict, dict]:
    """Sample production rows that already have full SSE/identity fields to compare against."""
    import random

    exclude_org_ids = exclude_org_ids or set()
    exclude_job_ids = exclude_job_ids or set()

    org_rows = (
        supabase.table("organizations")
        .select(
            "id,name,municipality,province,website,description,description_en,"
            "mission_statement,mission_statement_en,sse_rating,is_sse,type,sector_id,"
            "language,values_list,values,sse_details"
        )
        .not_.is_("sse_rating", "null")
        .not_.is_("sector_id", "null")
        .not_.is_("language", "null")
        .not_.is_("type", "null")
        .not_.is_("website", "null")
        .limit(120)
        .execute()
        .data
        or []
    )
    orgs = [o for o in org_rows if _org_is_complete(o) and o["id"] not in exclude_org_ids]
    if not orgs:
        raise SystemExit("No complete organizations found for --random-complete")

    job_rows = (
        supabase.table("jobs")
        .select(
            "id,job_title,organization,organization_id,location,municipality,province,"
            "wage,description,summary,sse_rating,is_sse,language,values,listing_url,"
            "date_posted,sse_details"
        )
        .not_.is_("sse_rating", "null")
        .not_.is_("language", "null")
        .not_.is_("description", "null")
        .limit(120)
        .execute()
        .data
        or []
    )
    jobs = [j for j in job_rows if _job_is_complete(j) and j["id"] not in exclude_job_ids]
    if not jobs:
        raise SystemExit("No complete jobs found for --random-complete")

    return random.choice(orgs), random.choice(jobs)

def _org_snapshot(row: dict) -> dict[str, Any]:
    return {
        "is_sse": bool(row.get("is_sse")),
        "sse_rating": row.get("sse_rating"),
        "sector_id": row.get("sector_id"),
        "language": row.get("language"),
        "type": row.get("type"),
        "website": row.get("website"),
        "website_norm": extract_domain(row.get("website")),
        "mission": row.get("mission_statement_en") or row.get("mission_statement"),
        "description": row.get("description_en") or row.get("description"),
        "values": row.get("values_list") or row.get("values"),
    }


def _job_snapshot_from_sse(result: dict, *, language: str | None = None) -> dict[str, Any]:
    rating = result.get("rating") or result.get("sse_rating")
    return {
        "is_sse": rating in ("strong_yes", "weak_yes"),
        "sse_rating": rating,
        "language": language,
        "reasoning": result.get("reasoning"),
        "confidence": result.get("confidence"),
        "must_haves_met": result.get("must_haves_met"),
        "nice_to_haves_met": result.get("nice_to_haves_met"),
        "flags": result.get("flags"),
    }


def run_org_on_provider(name: str, provider, org: dict, *, evidence: str) -> dict:
    assessor = OrganizationAssessor.__new__(OrganizationAssessor)
    assessor.provider = provider
    known = org.get("website")
    existing = (
        org.get("description_en")
        or org.get("description_fr")
        or org.get("description")
        or ""
    )
    prompt = _build_assessment_prompt(
        org["name"],
        org.get("municipality"),
        org.get("province"),
        "",
        "",
        known_website=known,
        existing_description=existing,
        listing_notes="",
    )
    ev = evidence
    if name == "ollama":
        from llm.tavily_grounding import ollama_evidence_budget, trim_evidence

        ev = trim_evidence(evidence, max_chars=ollama_evidence_budget())
    prompt = inject_grounding_evidence(prompt, ev)
    search_query = _build_search_query(
        org["name"], org.get("municipality"), org.get("province"), known_website=known,
    )
    t0 = time.perf_counter()
    try:
        raw = assessor._call_provider_with_retry(
            provider=provider,
            prompt=prompt,
            system=_ASSESSOR_SYSTEM,
            task="sse",
            search_query=search_query,
            retries=1,
            use_grounding=False,  # evidence already injected
        )
    except Exception as exc:
        return {"error": str(exc), "elapsed_s": round(time.perf_counter() - t0, 2)}

    parsed = _parse_response(raw, org["name"])
    if parsed is None:
        return {"error": "parse_failed", "raw": (raw or "")[:500], "elapsed_s": round(time.perf_counter() - t0, 2)}
    parsed = _apply_website_known_guard(parsed, known)
    parsed = assessor._ensure_length_limits(parsed, org["name"])
    updates = _result_to_db_fields(parsed)
    website = parsed.get("website")
    if website and evidence_domain(website):
        updates["website"] = website
    elif known and evidence_domain(known):
        updates["website"] = known
    else:
        updates["website"] = None
    row = _attach_org_language(
        {"name": org["name"], "language": None, **updates, "website": updates.get("website")},
        parsed.get("public_language"),
        force_lang=True,
        fetch_web=False,
    )
    snap = _org_snapshot(row)
    snap["elapsed_s"] = round(time.perf_counter() - t0, 2)
    snap["provider"] = name
    return snap


def run_job_on_provider(name: str, provider, job: dict, *, evidence: str) -> dict:
    classifier = SSEClassifier.__new__(SSEClassifier)
    classifier.provider = provider
    job_data = {
        "org_name": job.get("organization") or "",
        "title": job.get("job_title") or "",
        "location": job.get("location") or "",
        "salary": job.get("wage") or "Not specified",
        "description": job.get("description") or "",
        "posted_date": job.get("date_posted") or "",
    }
    prompt = get_sse_classification_prompt(
        org_name=job_data["org_name"],
        job_title=job_data["title"],
        location=job_data["location"],
        salary=job_data["salary"],
        job_description=job_data["description"],
        posted_date=job_data["posted_date"],
    )
    # Tavily only when the job has no description text.
    has_description = bool((job_data["description"] or "").strip())
    ev = "" if has_description else evidence
    if ev and name == "ollama":
        from llm.tavily_grounding import ollama_evidence_budget, trim_evidence

        ev = trim_evidence(ev, max_chars=ollama_evidence_budget())
    prompt = inject_grounding_evidence(prompt, ev)
    search_query = f'"{job_data["org_name"]}" official website mission governance'
    t0 = time.perf_counter()
    try:
        raw = classifier._call_provider_with_retry(
            provider=provider,
            prompt=prompt,
            system=(
                "You are an expert at evaluating job postings for Solidarity Economy alignment. "
                "Score the role from the posting body. Do not invent a different employer "
                "from search. Return valid JSON only."
            ),
            task="sse",
            search_query=search_query,
            retries=1,
            use_grounding=False,
        )
    except Exception as exc:
        return {"error": str(exc), "elapsed_s": round(time.perf_counter() - t0, 2)}

    try:
        parsed_result, parse_error = classifier._safe_parse_sse_response(
            raw, job_data["title"], job_data["org_name"],
        )
    except Exception as exc:
        return {"error": f"parse_exc:{exc}", "raw": (raw or "")[:500], "elapsed_s": round(time.perf_counter() - t0, 2)}
    if parsed_result is None:
        return {
            "error": parse_error or "parse_failed",
            "raw": (raw or "")[:500],
            "elapsed_s": round(time.perf_counter() - t0, 2),
        }
    result = parsed_result
    snap = _job_snapshot_from_sse(result, language=None)
    snap["elapsed_s"] = round(time.perf_counter() - t0, 2)
    snap["provider"] = name
    return snap


def compare_categorical(ref: dict, cand: dict, fields: tuple[str, ...]) -> dict:
    out = {}
    for f in fields:
        if f == "language" and cand.get(f) is None and ref.get(f) is not None:
            # Job SSE path doesn't set language
            out[f] = {"match": None, "ref": ref.get(f), "cand": None, "note": "not_produced_by_this_process"}
            continue
        rv, cv = ref.get(f), cand.get(f)
        if f == "is_sse":
            match = bool(rv) == bool(cv)
        elif f == "website_norm":
            match = (rv or None) == (cv or None)
        else:
            match = rv == cv
        out[f] = {"match": match, "ref": rv, "cand": cv}
    return out


def compare_text(ref: dict, cand: dict, fields: tuple[str, ...]) -> dict:
    out = {}
    for f in fields:
        if f == "summary_ref":
            continue
        out[f] = {
            "score": semantic_score(ref.get(f), cand.get(f)),
            "ref": (str(ref.get(f) or "")[:160] or None),
            "cand": (str(cand.get(f) or "")[:160] or None),
        }
    return out


def pairwise_categorical(results: dict[str, dict], fields: tuple[str, ...]) -> dict:
    """Agreement matrix across models for categorical fields."""
    names = [n for n, r in results.items() if r and not r.get("error")]
    matrix: dict[str, dict] = {}
    for f in fields:
        if f == "language" and all(results[n].get(f) is None for n in names):
            continue
        agree = 0
        total = 0
        values = {n: results[n].get(f) for n in names}
        # all-equal?
        uniq = {json.dumps(v, sort_keys=True, default=str) for v in values.values()}
        matrix[f] = {
            "all_models_agree": len(uniq) == 1,
            "values": values,
        }
    return matrix


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prod", action="store_true")
    parser.add_argument(
        "--random-complete",
        action="store_true",
        help="Pick a random org+job that already have complete prod SSE/identity fields",
    )
    parser.add_argument("--org-id", type=int, default=None, help="Default with --random-complete: pick one")
    parser.add_argument(
        "--job-id",
        default=None,
        help="Default with --random-complete: pick one",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent / "groq_org_eval" / "model_parity_dry_run.json",
    )
    args = parser.parse_args()

    reset_supabase_client_cache()
    if args.random_complete:
        org, job = pick_random_complete()
        print(
            f"Picked complete records: org_id={org['id']} ({org['name']}), "
            f"job_id={job['id']} ({job.get('job_title')} @ {job.get('organization')})"
        )
    else:
        org_id = args.org_id if args.org_id is not None else 157
        job_id = args.job_id or "a7a0b259-f801-40e8-8978-ab08f52667cf"
        org = fetch_org(org_id)
        job = fetch_job(job_id)
        if not _org_is_complete(org):
            print(
                "WARNING: org record is incomplete vs prod compare fields "
                "(need sse_rating, is_sse, sector_id, language, type, website, description). "
                "Use --random-complete for a fairer baseline.",
                flush=True,
            )
        if not _job_is_complete(job):
            print(
                "WARNING: job record is incomplete vs prod compare fields "
                "(need sse_rating, is_sse, language, organization, description≥500). "
                "Use --random-complete for a fairer baseline.",
                flush=True,
            )
    providers = _providers()
    if not providers:
        raise SystemExit("No providers available")

    print(f"\nORG ref: id={org['id']} {org['name']}")
    print(f"  prod: is_sse={org.get('is_sse')} rating={org.get('sse_rating')} "
          f"sector={org.get('sector_id')} lang={org.get('language')} type={org.get('type')}")
    print(f"JOB ref: id={job['id']} {job.get('job_title')} @ {job.get('organization')}")
    print(f"  prod: is_sse={job.get('is_sse')} rating={job.get('sse_rating')} lang={job.get('language')}")
    print(f"Providers: {[n for n, _ in providers]}\n")

    org_query = _build_search_query(
        org["name"], org.get("municipality"), org.get("province"), known_website=org.get("website"),
    )
    job_org = job.get("organization") or ""
    job_query = f'"{job_org}" official website mission governance'
    org_existing = (
        org.get("description_en")
        or org.get("description_fr")
        or org.get("description")
        or ""
    ).strip()
    job_existing = (job.get("description") or "").strip()
    print("Fetching shared Tavily evidence…")
    print("  org: always (interpretive research); job: only if posting description missing")
    org_host = extract_domain(org.get("website"))
    org_evidence = fetch_tavily_context(
        org_query,
        include_domains=[org_host] if org_host else None,
        prefer_hosts=[org_host] if org_host else None,
        require_terms=entity_require_terms(org["name"]),
    )
    job_evidence = ""
    if not job_existing:
        job_evidence = fetch_tavily_context(
            job_query,
            require_terms=entity_require_terms(job_org),
        )

    print(
        f"  org evidence chars={len(org_evidence)} "
        f"job evidence chars={len(job_evidence)} "
        f"(job_skip_tavily={bool(job_existing)})"
    )

    org_ref = _org_snapshot(org)
    job_ref = {
        "is_sse": bool(job.get("is_sse")),
        "sse_rating": job.get("sse_rating"),
        "language": job.get("language"),
        "reasoning": (job.get("sse_details") or {}).get("reasoning")
        if isinstance(job.get("sse_details"), dict)
        else None,
        "summary_ref": job.get("summary"),
    }

    org_results: dict[str, dict] = {}
    job_results: dict[str, dict] = {}

    for name, provider in providers:
        print(f"\n=== {name}: ORG ===")
        org_results[name] = run_org_on_provider(name, provider, org, evidence=org_evidence)
        if org_results[name].get("error"):
            print(f"  ERROR {org_results[name]['error']}")
        else:
            r = org_results[name]
            print(
                f"  is_sse={r['is_sse']} rating={r['sse_rating']} sector={r['sector_id']} "
                f"lang={r['language']} type={r['type']} web={r['website_norm']} ({r['elapsed_s']}s)"
            )

        print(f"=== {name}: JOB ===")
        job_results[name] = run_job_on_provider(name, provider, job, evidence=job_evidence)
        if job_results[name].get("error"):
            print(f"  ERROR {job_results[name]['error']}")
        else:
            r = job_results[name]
            print(
                f"  is_sse={r['is_sse']} rating={r['sse_rating']} "
                f"conf={r.get('confidence')} ({r['elapsed_s']}s)"
            )
            print(f"  reasoning: {(r.get('reasoning') or '')[:140]}")

    # Comparisons vs prod + cross-model
    org_vs_prod = {
        n: {
            "categorical": compare_categorical(org_ref, r, ORG_CATEGORICAL),
            "text": compare_text(org_ref, r, ORG_TEXT),
        }
        for n, r in org_results.items()
        if not r.get("error")
    }
    job_vs_prod = {
        n: {
            "categorical": compare_categorical(job_ref, r, JOB_CATEGORICAL),
            "text": compare_text(job_ref, r, ("reasoning",)),
        }
        for n, r in job_results.items()
        if not r.get("error")
    }

    org_cross = pairwise_categorical(org_results, ORG_CATEGORICAL)
    job_cross = pairwise_categorical(job_results, ("is_sse", "sse_rating"))

    def cat_accuracy(vs_prod: dict, fields: tuple[str, ...]) -> dict:
        acc: dict[str, dict] = {}
        for f in fields:
            scored = []
            for n, block in vs_prod.items():
                cell = block["categorical"].get(f) or {}
                if cell.get("match") is None:
                    continue
                scored.append(bool(cell["match"]))
            if not scored:
                continue
            acc[f] = {
                "matches": sum(scored),
                "total": len(scored),
                "pct": round(100 * sum(scored) / len(scored), 1),
            }
        return acc

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": True,
        "org_ref": {"id": org["id"], "name": org["name"], **org_ref},
        "job_ref": {
            "id": job["id"],
            "title": job.get("job_title"),
            "organization": job.get("organization"),
            **job_ref,
        },
        "org_evidence_chars": len(org_evidence),
        "job_evidence_chars": len(job_evidence),
        "org_results": org_results,
        "job_results": job_results,
        "org_vs_prod": org_vs_prod,
        "job_vs_prod": job_vs_prod,
        "org_cross_model_categorical": org_cross,
        "job_cross_model_categorical": job_cross,
        "org_categorical_accuracy_vs_prod": cat_accuracy(org_vs_prod, ORG_CATEGORICAL),
        "job_categorical_accuracy_vs_prod": cat_accuracy(job_vs_prod, JOB_CATEGORICAL),
        "note_org_vs_job": (
            "Org assessment rates the employer (governance/mission). "
            "Job SSE classification rates the posting (role + org context + compensation rules). "
            "They can legitimately disagree (e.g. SSE-aligned role at a non-SSE employer)."
        ),
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n" + "=" * 64)
    print("ORG categorical agreement across models")
    for f, info in org_cross.items():
        mark = "✓" if info["all_models_agree"] else "✗"
        print(f"  {mark} {f}: {info['values']}")
    print("JOB categorical agreement across models")
    for f, info in job_cross.items():
        mark = "✓" if info["all_models_agree"] else "✗"
        print(f"  {mark} {f}: {info['values']}")
    print("-" * 64)
    print("ORG vs prod categorical accuracy (across models that succeeded)")
    for f, a in payload["org_categorical_accuracy_vs_prod"].items():
        print(f"  {f}: {a['pct']}% ({a['matches']}/{a['total']})")
    print("JOB vs prod categorical accuracy")
    for f, a in payload["job_categorical_accuracy_vs_prod"].items():
        print(f"  {f}: {a['pct']}% ({a['matches']}/{a['total']})")
    print("=" * 64)
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
