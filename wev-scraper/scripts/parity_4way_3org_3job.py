#!/usr/bin/env python
"""4-way dry-run parity: prod | gemini+tav | groq+tav | cerebras+tav.

Forces Tavily grounding for every re-run and isolates each provider.
Never writes to Supabase. Never commits.

Usage:
  CONFIRM_PROD_RUN=YES ./venv/bin/python scripts/parity_4way_3org_3job.py --prod
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

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
    print(f"PRODUCTION DB (read-only); keys={', '.join(applied) or '(none)'}")

# Tavily-always; no Gemini Google Search divergence
os.environ["USE_GOOGLE_SEARCH_GROUNDING"] = "0"
os.environ["FORCE_GROUNDING"] = "1"
os.environ["ENV_MODE"] = os.environ.get("ENV_MODE") or "prod"

from llm.gemini import GeminiProvider  # noqa: E402
from llm.gemini_fallback import SSEFallbackProvider, gemini_sse_primary_model  # noqa: E402
from llm.groq import GROQ_MODELS, GroqProvider  # noqa: E402
from llm.openai_compatible import CerebrasProvider  # noqa: E402
from llm.tavily_grounding import entity_require_terms  # noqa: E402
from utils.db import reset_supabase_client_cache, supabase  # noqa: E402
from utils.organization_assessment import (  # noqa: E402
    OrganizationAssessor,
    _apply_website_known_guard,
    _attach_org_language,
    _result_to_db_fields,
)
from utils.sse_classifier import SSEClassifier  # noqa: E402
from utils.sse_prompts import get_sse_classification_prompt  # noqa: E402

LOG_PATH = Path("/tmp/parity_4way_3org_3job.log")
OUT_JSON = Path(__file__).resolve().parent / "parity_4way_3org_3job.json"
OUT_MD = Path(__file__).resolve().parent / "parity_4way_3org_3job.md"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_PATH, mode="w"),
    ],
)
logger = logging.getLogger("parity_4way")

# Fixed sample: diverse orgs + prior/parity-friendly jobs
ORG_IDS = [1420, 1417, 555]  # Le Détour (NP yes), AECL (gov no), NCC (NP weak_yes)
JOB_IDS = [
    "a7a0b259-f801-40e8-8978-ab08f52667cf",  # Goparity HR — strong_yes
    "95df85b1-4336-49ba-83e1-875acde3ae86",  # EnviroCentre volunteer — strong_yes
    "727962ad-042f-4048-a9f2-395545b2598f",  # Evergreen Account Manager — weak_yes borderline
]

ORG_STRUCT = ("location", "type", "sector_id", "sse_rating", "website", "is_sse")
JOB_STRUCT = ("sse_rating", "is_sse")
PROVIDERS = ("gemini", "groq", "cerebras")


def _host(url: str | None) -> str | None:
    if not url:
        return None
    host = (urlparse(url).hostname or "").lower().strip(".")
    return host[4:] if host.startswith("www.") else host or None


def _norm_website(a: str | None, b: str | None) -> bool:
    return _host(a) == _host(b)


def _loc(org: dict) -> str:
    m = (org.get("municipality") or "").strip()
    p = (org.get("province") or "").strip()
    if m and p:
        return f"{m}, {p}"
    return m or p or ""


def single_provider_chain(name: str) -> SSEFallbackProvider:
    """SSEFallbackProvider with exactly one backend (Ollama never included)."""
    if name == "gemini":
        model = gemini_sse_primary_model()
        backend: Any = GeminiProvider(model=model)
        label = model
    elif name == "groq":
        if not GROQ_MODELS:
            raise RuntimeError("GROQ_MODELS empty — cannot run Groq")
        backend = GroqProvider()
        label = "groq"
    elif name == "cerebras":
        backend = CerebrasProvider()
        label = "cerebras"
    else:
        raise ValueError(name)

    if not backend.is_available():
        raise RuntimeError(f"{name} unavailable (missing API key?)")

    chain = SSEFallbackProvider.__new__(SSEFallbackProvider)
    chain._providers = [(label, backend)]
    chain._last_successful = None
    logger.info("Forced provider chain: %s only (tavily via SSEFallbackProvider)", label)
    return chain


def fetch_org(org_id: int) -> dict:
    cols = (
        "id,name,municipality,province,website,description,description_en,"
        "mission_statement,mission_statement_en,sse_rating,is_sse,type,sector_id,"
        "language,values_list,values,sse_details"
    )
    rows = (
        supabase.table("organizations").select(cols).eq("id", org_id).limit(1).execute().data
        or []
    )
    if not rows:
        raise SystemExit(f"Org {org_id} not found")
    return rows[0]


def fetch_job(job_id: str) -> dict:
    cols = (
        "id,job_title,organization,organization_id,location,municipality,province,"
        "wage,description,summary,sse_rating,is_sse,language,values,listing_url,"
        "date_posted,scraped_at,sse_details"
    )
    rows = (
        supabase.table("jobs").select(cols).eq("id", job_id).limit(1).execute().data or []
    )
    if not rows:
        raise SystemExit(f"Job {job_id} not found")
    return rows[0]


def assess_org(provider: Any, org: dict) -> dict[str, Any]:
    assessor = OrganizationAssessor.__new__(OrganizationAssessor)
    assessor.provider = provider
    t0 = time.perf_counter()
    try:
        result = assessor.assess(
            raw_name=org["name"],
            municipality=org.get("municipality"),
            province=org.get("province"),
            job_title="",
            description="",
            known_website=org.get("website"),
            existing_description=(
                org.get("description_en") or org.get("description") or ""
            ),
            listing_notes="",
        )
        if result is None:
            return {
                "error": "assessor returned None",
                "elapsed_s": round(time.perf_counter() - t0, 2),
            }
        result = _apply_website_known_guard(result, org.get("website"))
        updates = _result_to_db_fields(result)
        website = updates.get("website") or org.get("website")
        row = _attach_org_language(
            {
                "name": org["name"],
                "language": None,
                **updates,
                "website": website,
            },
            result.get("public_language"),
            force_lang=True,
        )
        mission = (row.get("mission_statement") or "")[:180]
        return {
            "location": _loc(
                {
                    "municipality": org.get("municipality"),
                    "province": org.get("province"),
                }
            ),
            "type": row.get("type"),
            "sector_id": row.get("sector_id"),
            "sse_rating": row.get("sse_rating"),
            "website": row.get("website"),
            "website_norm": _host(row.get("website")),
            "is_sse": row.get("is_sse"),
            "language": row.get("language"),
            "mission_short": mission,
            "elapsed_s": round(time.perf_counter() - t0, 2),
            "provider_used": getattr(provider, "current_model", None),
            "error": None,
        }
    except Exception as exc:
        logger.exception("org assess failed")
        return {"error": str(exc), "elapsed_s": round(time.perf_counter() - t0, 2)}


def classify_job_tavily_always(provider: Any, job: dict) -> dict[str, Any]:
    """Force Tavily even when the posting has a description."""
    clf = SSEClassifier.__new__(SSEClassifier)
    clf.provider = provider
    t0 = time.perf_counter()
    org_name = job.get("organization") or ""
    job_title = job.get("job_title") or ""
    location = job.get("location") or ""
    salary = job.get("wage") or "Not specified"
    description = job.get("description") or ""
    posted_date = str(job.get("date_posted") or "")

    prompt = get_sse_classification_prompt(
        org_name=org_name,
        job_title=job_title,
        location=location or "Unknown",
        salary=salary,
        job_description=description if description.strip() else "(no description provided)",
        posted_date=posted_date,
    )
    search_terms = f'"{org_name}"'
    if location:
        search_terms += f' "{location}"'
    search_query = f"{search_terms} official website mission governance"
    require_terms = entity_require_terms(org_name) or None

    try:
        response_text = clf._call_provider_with_retry(
            provider=provider,
            prompt=prompt,
            system=(
                "You are an expert at analyzing job postings for Solidarity "
                "Economy alignment. Score the role from the posting body. "
                "Do not invent a different employer from search. Supporting "
                "web evidence supplements missing employer context."
            ),
            task="sse",
            search_query=search_query,
            retries=1,
            require_terms=require_terms,
            use_grounding=True,  # Tavily-always
        )
        parsed, parse_error = clf._safe_parse_sse_response(
            response_text, job_title, org_name
        )
        if parsed is None:
            return {
                "error": parse_error or "parse_failed",
                "raw": (response_text or "")[:400],
                "elapsed_s": round(time.perf_counter() - t0, 2),
            }
        rating = parsed.get("rating")
        return {
            "sse_rating": rating,
            "is_sse": rating in ("strong_yes", "weak_yes") if rating else None,
            "confidence": parsed.get("confidence"),
            "reasoning_short": (parsed.get("reasoning") or "")[:200],
            "elapsed_s": round(time.perf_counter() - t0, 2),
            "provider_used": getattr(provider, "current_model", None),
            "error": None,
        }
    except Exception as exc:
        logger.exception("job classify failed")
        return {"error": str(exc), "elapsed_s": round(time.perf_counter() - t0, 2)}


def org_prod_snap(org: dict) -> dict:
    return {
        "location": _loc(org),
        "type": org.get("type"),
        "sector_id": org.get("sector_id"),
        "sse_rating": org.get("sse_rating"),
        "website": org.get("website"),
        "website_norm": _host(org.get("website")),
        "is_sse": org.get("is_sse"),
        "language": org.get("language"),
        "mission_short": (org.get("mission_statement") or org.get("mission_statement_en") or "")[
            :180
        ],
    }


def job_prod_snap(job: dict) -> dict:
    return {
        "sse_rating": job.get("sse_rating"),
        "is_sse": job.get("is_sse"),
        "title": job.get("job_title"),
        "organization": job.get("organization"),
    }


def field_match(ref: dict, cand: dict, field: str) -> bool | None:
    if cand.get("error"):
        return None
    if field == "website":
        return _norm_website(ref.get("website"), cand.get("website"))
    if field == "location":
        # location is from prod geo; providers don't re-geocode — always compare prod loc to itself for display
        return True
    return ref.get(field) == cand.get(field)


def match_rate(pairs: list[tuple[dict, dict]], fields: tuple[str, ...]) -> dict:
    stats = {f: {"matches": 0, "total": 0} for f in fields}
    for ref, cand in pairs:
        if cand.get("error"):
            continue
        for f in fields:
            if f == "location":
                continue  # not re-extracted by assessor path
            ok = field_match(ref, cand, f)
            if ok is None:
                continue
            stats[f]["total"] += 1
            if ok:
                stats[f]["matches"] += 1
    out = {}
    for f, v in stats.items():
        if f == "location":
            continue
        pct = round(100.0 * v["matches"] / v["total"], 1) if v["total"] else None
        out[f] = {**v, "pct": pct}
    # overall across structural fields
    m = sum(v["matches"] for v in out.values())
    t = sum(v["total"] for v in out.values())
    out["_overall"] = {
        "matches": m,
        "total": t,
        "pct": round(100.0 * m / t, 1) if t else None,
    }
    return out


def fmt_cell(snap: dict, *, kind: str) -> str:
    if snap.get("error"):
        return f"ERR: {snap['error'][:40]}"
    if kind == "org":
        return (
            f"{snap.get('sse_rating')}/{snap.get('is_sse')} "
            f"type={snap.get('type')} sec={snap.get('sector_id')} "
            f"web={snap.get('website_norm') or _host(snap.get('website'))}"
        )
    return f"{snap.get('sse_rating')}/{snap.get('is_sse')}"


def write_md(summary: dict) -> None:
    lines: list[str] = []
    lines.append("# 4-way parity: prod | gemini+tav | groq+tav | cerebras+tav")
    lines.append("")
    lines.append(f"Generated: `{summary['generated_at']}`")
    lines.append("")
    lines.append(
        "Setup: Tavily-always (`FORCE_GROUNDING=1`, `USE_GOOGLE_SEARCH_GROUNDING=0`); "
        "each provider forced alone; Ollama skipped; no prod writes."
    )
    lines.append("")
    lines.append(f"Models: `{json.dumps(summary['models'])}`")
    lines.append("")
    lines.append("## Orgs (3)")
    lines.append("")
    lines.append("| Org | Prod | Gemini+T | Groq+T | Cerebras+T | notes |")
    lines.append("|---|---|---|---|---|---|")
    for o in summary["orgs"]:
        name = o["name"]
        notes = o.get("notes") or ""
        lines.append(
            f"| {name} ({o['org_id']}) | `{fmt_cell(o['prod'], kind='org')}` "
            f"| `{fmt_cell(o['gemini'], kind='org')}` "
            f"| `{fmt_cell(o['groq'], kind='org')}` "
            f"| `{fmt_cell(o['cerebras'], kind='org')}` | {notes} |"
        )
    lines.append("")
    lines.append("### Org structural detail")
    lines.append("")
    for o in summary["orgs"]:
        lines.append(f"**{o['name']}** — prod location `{o['prod'].get('location')}`")
        lines.append("")
        lines.append("| field | Prod | Gemini+T | Groq+T | Cerebras+T |")
        lines.append("|---|---|---|---|---|")
        for f in ORG_STRUCT:
            if f == "location":
                lines.append(
                    f"| location | {o['prod'].get('location')} | (from prod geo) | (from prod geo) | (from prod geo) |"
                )
                continue
            pv = o["prod"].get("website_norm" if f == "website" else f)
            if f == "website":
                gv = o["gemini"].get("website_norm") or _host(o["gemini"].get("website"))
                qv = o["groq"].get("website_norm") or _host(o["groq"].get("website"))
                cv = o["cerebras"].get("website_norm") or _host(o["cerebras"].get("website"))
            else:
                gv = o["gemini"].get(f)
                qv = o["groq"].get(f)
                cv = o["cerebras"].get(f)
            lines.append(f"| {f} | {pv} | {gv} | {qv} | {cv} |")
        lines.append("")

    lines.append("## Jobs (3)")
    lines.append("")
    lines.append("| Job | Prod | Gemini+T | Groq+T | Cerebras+T | notes |")
    lines.append("|---|---|---|---|---|---|")
    for j in summary["jobs"]:
        label = f"{j['title'][:40]} @ {j['organization']}"
        notes = j.get("notes") or ""
        lines.append(
            f"| {label} | `{fmt_cell(j['prod'], kind='job')}` "
            f"| `{fmt_cell(j['gemini'], kind='job')}` "
            f"| `{fmt_cell(j['groq'], kind='job')}` "
            f"| `{fmt_cell(j['cerebras'], kind='job')}` | {notes} |"
        )
    lines.append("")

    lines.append("## Match rates")
    lines.append("")
    lines.append("### Provider ↔ prod (orgs)")
    lines.append("")
    lines.append("| Provider | overall | " + " | ".join(f for f in ORG_STRUCT if f != "location") + " |")
    lines.append("|---|" + "|".join(["---"] * (1 + len([f for f in ORG_STRUCT if f != "location"]))) + "|")
    for p in PROVIDERS:
        r = summary["rates"]["org_vs_prod"][p]
        cells = [f"{r['_overall']['pct']}%"]
        for f in ORG_STRUCT:
            if f == "location":
                continue
            cells.append(f"{r[f]['pct']}% ({r[f]['matches']}/{r[f]['total']})")
        lines.append(f"| {p}+tav | " + " | ".join(cells) + " |")
    lines.append("")
    lines.append("### Provider ↔ gemini (orgs)")
    lines.append("")
    lines.append("| Provider | overall | " + " | ".join(f for f in ORG_STRUCT if f != "location") + " |")
    lines.append("|---|" + "|".join(["---"] * (1 + len([f for f in ORG_STRUCT if f != "location"]))) + "|")
    for p in ("groq", "cerebras"):
        r = summary["rates"]["org_vs_gemini"][p]
        cells = [f"{r['_overall']['pct']}%"]
        for f in ORG_STRUCT:
            if f == "location":
                continue
            cells.append(f"{r[f]['pct']}% ({r[f]['matches']}/{r[f]['total']})")
        lines.append(f"| {p}+tav | " + " | ".join(cells) + " |")
    lines.append("")
    lines.append("### Provider ↔ prod (jobs)")
    lines.append("")
    lines.append("| Provider | overall | sse_rating | is_sse |")
    lines.append("|---|---|---|---|")
    for p in PROVIDERS:
        r = summary["rates"]["job_vs_prod"][p]
        lines.append(
            f"| {p}+tav | {r['_overall']['pct']}% | "
            f"{r['sse_rating']['pct']}% ({r['sse_rating']['matches']}/{r['sse_rating']['total']}) | "
            f"{r['is_sse']['pct']}% ({r['is_sse']['matches']}/{r['is_sse']['total']}) |"
        )
    lines.append("")
    lines.append("### Provider ↔ gemini (jobs)")
    lines.append("")
    lines.append("| Provider | overall | sse_rating | is_sse |")
    lines.append("|---|---|---|---|")
    for p in ("groq", "cerebras"):
        r = summary["rates"]["job_vs_gemini"][p]
        lines.append(
            f"| {p}+tav | {r['_overall']['pct']}% | "
            f"{r['sse_rating']['pct']}% ({r['sse_rating']['matches']}/{r['sse_rating']['total']}) | "
            f"{r['is_sse']['pct']}% ({r['is_sse']['matches']}/{r['is_sse']['total']}) |"
        )
    lines.append("")
    lines.append("## Verdict")
    lines.append("")
    lines.append(summary.get("verdict") or "")
    lines.append("")
    OUT_MD.write_text("\n".join(lines))
    logger.info("Wrote %s", OUT_MD)


def build_verdict(summary: dict) -> str:
    og = summary["rates"]["org_vs_gemini"]
    jg = summary["rates"]["job_vs_gemini"]
    op = summary["rates"]["org_vs_prod"]
    jp = summary["rates"]["job_vs_prod"]

    groq_org = og["groq"]["_overall"]["pct"]
    cer_org = og["cerebras"]["_overall"]["pct"]
    groq_job = jg["groq"]["_overall"]["pct"]
    cer_job = jg["cerebras"]["_overall"]["pct"]

    # Spot lagging fields for Cerebras vs gemini
    lag = []
    for f in ("sse_rating", "website", "type", "sector_id", "is_sse"):
        g = og["cerebras"].get(f, {})
        if g.get("pct") is not None and g["pct"] < 100:
            lag.append(f"{f} {g['matches']}/{g['total']}")
    for f in ("sse_rating", "is_sse"):
        g = jg["cerebras"].get(f, {})
        if g.get("pct") is not None and g["pct"] < 100:
            lag.append(f"job.{f} {g['matches']}/{g['total']}")

    bits = []
    bits.append(
        f"- **Groq ↔ Gemini**: orgs {groq_org}%, jobs {groq_job}% "
        f"(vs prod: orgs {op['groq']['_overall']['pct']}%, jobs {jp['groq']['_overall']['pct']}%)."
    )
    bits.append(
        f"- **Cerebras ↔ Gemini**: orgs {cer_org}%, jobs {cer_job}% "
        f"(vs prod: orgs {op['cerebras']['_overall']['pct']}%, jobs {jp['cerebras']['_overall']['pct']}%)."
    )
    if groq_org is not None and groq_org >= 80 and (groq_job is None or groq_job >= 66):
        bits.append("- **Groq still ~Gemini quality** on structural fields under shared Tavily.")
    else:
        bits.append("- **Groq diverges from Gemini** more than expected — see field tables.")
    if cer_org is not None and cer_org < (groq_org or 100):
        bits.append(
            f"- **Cerebras lags Gemini** relative to Groq"
            + (f" on: {', '.join(lag)}." if lag else ".")
        )
    elif lag:
        bits.append(f"- Cerebras mismatches vs Gemini: {', '.join(lag)}.")
    else:
        bits.append("- Cerebras matched Gemini on all compared structural fields in this sample.")
    return "\n".join(bits)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prod", action="store_true")
    parser.add_argument("--sleep", type=float, default=8.0, help="Seconds between provider calls")
    args = parser.parse_args()

    reset_supabase_client_cache()

    logger.info("GROQ_MODELS=%s", GROQ_MODELS)
    if not GROQ_MODELS:
        raise SystemExit("GROQ_MODELS empty on this branch")

    models = {
        "gemini": gemini_sse_primary_model(),
        "groq": GROQ_MODELS[0],
        "cerebras": CerebrasProvider()._model if CerebrasProvider().is_available() else None,
    }
    logger.info("models=%s", models)

    orgs = [fetch_org(i) for i in ORG_IDS]
    jobs = [fetch_job(i) for i in JOB_IDS]
    logger.info(
        "Selected orgs: %s",
        [(o["id"], o["name"], o["sse_rating"], o["type"]) for o in orgs],
    )
    logger.info(
        "Selected jobs: %s",
        [(j["id"][:8], j["job_title"][:40], j["organization"], j["sse_rating"]) for j in jobs],
    )

    org_reports: list[dict] = []
    for org in orgs:
        report: dict[str, Any] = {
            "org_id": org["id"],
            "name": org["name"],
            "prod": org_prod_snap(org),
        }
        for pname in PROVIDERS:
            logger.info("=== ORG %s via %s ===", org["name"], pname)
            try:
                chain = single_provider_chain(pname)
                cand = assess_org(chain, org)
            except Exception as exc:
                cand = {"error": str(exc)}
            report[pname] = cand
            logger.info("  -> %s", fmt_cell(cand, kind="org"))
            time.sleep(args.sleep)
        # notes
        notes_bits = []
        for pname in PROVIDERS:
            c = report[pname]
            if c.get("error"):
                notes_bits.append(f"{pname} err")
                continue
            misses = [
                f
                for f in ("type", "sector_id", "sse_rating", "is_sse", "website")
                if not field_match(report["prod"], c, f)
            ]
            if misses:
                notes_bits.append(f"{pname}≠prod:{','.join(misses)}")
        report["notes"] = "; ".join(notes_bits)
        org_reports.append(report)

    job_reports: list[dict] = []
    for job in jobs:
        report = {
            "job_id": job["id"],
            "title": job.get("job_title"),
            "organization": job.get("organization"),
            "prod": job_prod_snap(job),
        }
        for pname in PROVIDERS:
            logger.info(
                "=== JOB %s @ %s via %s ===",
                (job.get("job_title") or "")[:40],
                job.get("organization"),
                pname,
            )
            try:
                chain = single_provider_chain(pname)
                cand = classify_job_tavily_always(chain, job)
            except Exception as exc:
                cand = {"error": str(exc)}
            report[pname] = cand
            logger.info("  -> %s", fmt_cell(cand, kind="job"))
            time.sleep(args.sleep)
        notes_bits = []
        for pname in PROVIDERS:
            c = report[pname]
            if c.get("error"):
                notes_bits.append(f"{pname} err")
                continue
            misses = [
                f for f in JOB_STRUCT if not field_match(report["prod"], c, f)
            ]
            if misses:
                notes_bits.append(f"{pname}≠prod:{','.join(misses)}")
        report["notes"] = "; ".join(notes_bits)
        job_reports.append(report)

    rates = {
        "org_vs_prod": {},
        "org_vs_gemini": {},
        "job_vs_prod": {},
        "job_vs_gemini": {},
    }
    for p in PROVIDERS:
        rates["org_vs_prod"][p] = match_rate(
            [(r["prod"], r[p]) for r in org_reports], ORG_STRUCT
        )
        rates["job_vs_prod"][p] = match_rate(
            [(r["prod"], r[p]) for r in job_reports], JOB_STRUCT
        )
    for p in ("groq", "cerebras"):
        rates["org_vs_gemini"][p] = match_rate(
            [(r["gemini"], r[p]) for r in org_reports], ORG_STRUCT
        )
        rates["job_vs_gemini"][p] = match_rate(
            [(r["gemini"], r[p]) for r in job_reports], JOB_STRUCT
        )

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "models": models,
        "env": {
            "USE_GOOGLE_SEARCH_GROUNDING": os.environ.get("USE_GOOGLE_SEARCH_GROUNDING"),
            "FORCE_GROUNDING": os.environ.get("FORCE_GROUNDING"),
            "GROQ_MODELS": list(GROQ_MODELS),
        },
        "orgs": org_reports,
        "jobs": job_reports,
        "rates": rates,
    }
    summary["verdict"] = build_verdict(summary)

    OUT_JSON.write_text(json.dumps(summary, indent=2, default=str))
    logger.info("Wrote %s", OUT_JSON)
    write_md(summary)

    print("\n======== HEADLINE RATES ========")
    for label, block in (
        ("org↔prod", rates["org_vs_prod"]),
        ("org↔gemini", rates["org_vs_gemini"]),
        ("job↔prod", rates["job_vs_prod"]),
        ("job↔gemini", rates["job_vs_gemini"]),
    ):
        print(label, {k: v["_overall"] for k, v in block.items()})
    print("\n" + summary["verdict"])
    print(f"\nLog: {LOG_PATH}")
    print(f"MD:  {OUT_MD}")
    print(f"JSON:{OUT_JSON}")


if __name__ == "__main__":
    main()
