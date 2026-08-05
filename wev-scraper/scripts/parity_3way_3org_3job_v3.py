#!/usr/bin/env python
"""3-way dry-run parity v3: prod | gemini+tav | groq+tav.

Post-prompt-fix retest on the SAME v2 entity IDs (3 orgs + 3 jobs).
Forces Tavily grounding for every re-run and isolates each provider.
Never writes to Supabase. Never commits. No Cerebras.

Usage:
  CONFIRM_PROD_RUN=YES ./venv/bin/python scripts/parity_3way_3org_3job_v3.py --prod
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

from settings import (  # noqa: E402
    ensure_env_loaded,
    get_gemini_api_key,
    get_groq_api_key,
    load_db_credentials_only,
)
from utils.prod_env import (  # noqa: E402
    confirm_prod_run,
    mark_prod_confirmed,
    resolve_prod_env_path,
)
from dotenv import dotenv_values  # noqa: E402

# Parent monorepo .env (python-dotenv strips inline # comments — never naive parse)
_MONOREPO_ENV = Path(__file__).resolve().parents[2] / ".env"
_LLM_ENV_KEYS = ("GROQ_API_KEY", "GEMINI_API_KEY", "TAVILY_API_KEY")


def _reload_llm_keys_from_monorepo() -> dict[str, int]:
    """Reload LLM keys only via dotenv_values (comment-safe).

    Does NOT touch SUPABASE_* so --prod DB credentials stay intact.
    """
    if not _MONOREPO_ENV.is_file():
        raise SystemExit(f"Missing monorepo env: {_MONOREPO_ENV}")
    values = dotenv_values(_MONOREPO_ENV)
    lengths: dict[str, int] = {}
    for key in _LLM_ENV_KEYS:
        raw = values.get(key)
        if raw is None:
            continue
        val = raw.strip() if isinstance(raw, str) else str(raw)
        os.environ[key] = val
        lengths[key] = len(val)
    return lengths


ensure_env_loaded()
# Fresh LLM keys from monorepo .env before provider init (override=True on whole
# file would clobber --prod DB creds later, so use key-scoped reload).
_reload_llm_keys_from_monorepo()
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

LOG_PATH = Path("/tmp/parity_3way_3org_3job_v3.log")
OUT_JSON = Path(__file__).resolve().parent / "parity_3way_3org_3job_v3.json"
OUT_MD = Path(__file__).resolve().parent / "parity_3way_3org_3job_v3.md"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_PATH, mode="w"),
    ],
)
logger = logging.getLogger("parity_3way_v3")

# Fresh sample — excludes prior parity IDs (1419/1416/1413 + prior jobs)
# Orgs: Oakville Wind Orchestra (SSE NP), Artsmarketing Services Inc. (for-profit no),
# Eeyou Marine Region Planning Commission (gov no)
ORG_IDS = [1415, 1408, 1399]
JOB_IDS = [
    "21cb5cc3-5125-4108-9ac8-7421239dc027",  # Centre de formation populaire — strong_yes
    "34bbfc67-cc57-45c6-8764-a0d54decc171",  # Bouthillette Parizeau — weak_yes
    "7ecc11d0-cb69-41f0-8c87-8f17853e02b4",  # MSC — no
]

ORG_STRUCT = ("location", "type", "sector_id", "sse_rating", "website", "is_sse")
JOB_STRUCT = ("sse_rating", "is_sse")
PROVIDERS = ("gemini", "groq")


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
        backend: Any = GeminiProvider(
            api_key=get_gemini_api_key() or None,
            model=model,
        )
        label = model
    elif name == "groq":
        if not GROQ_MODELS:
            raise RuntimeError("GROQ_MODELS empty — cannot run Groq")
        # Pin 70b for parity — do not silently fall back to 8b on quota.
        backend = GroqProvider(
            api_key=get_groq_api_key() or None,
            model="llama-3.3-70b-versatile",
        )
        # Prevent intra-provider model cascade for this dry-run.
        backend._exhausted_models = set(GROQ_MODELS[1:])
        label = "groq"
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
        # Prefer assessor website (includes known-website guard); fall back to
        # prod known URL so re-assess never drops an evidence-grade site.
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
        return True
    return ref.get(field) == cand.get(field)


def match_rate(pairs: list[tuple[dict, dict]], fields: tuple[str, ...]) -> dict:
    stats = {f: {"matches": 0, "total": 0} for f in fields}
    for ref, cand in pairs:
        if cand.get("error"):
            continue
        for f in fields:
            if f == "location":
                continue
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


def note_org(report: dict) -> str:
    bits = []
    for pname in PROVIDERS:
        c = report[pname]
        if c.get("error"):
            bits.append(f"{pname} err")
            continue
        misses = [
            f
            for f in ("type", "sector_id", "sse_rating", "is_sse", "website")
            if not field_match(report["prod"], c, f)
        ]
        if not misses:
            bits.append(f"{pname}=prod")
            continue
        # Flag improvement vs regression on is_sse / for-profit→no
        prod_r = report["prod"].get("sse_rating")
        cand_r = c.get("sse_rating")
        if "sse_rating" in misses or "is_sse" in misses:
            prod_type = report["prod"].get("type")
            # For-profit / other / government already "no" → yes is a regression
            if prod_r in ("strong_yes", "weak_yes") and cand_r == "no":
                bits.append(f"{pname}: REGRESSION sse {prod_r}→{cand_r}")
            elif (
                prod_r == "no"
                and cand_r in ("strong_yes", "weak_yes")
                and prod_type in ("other", "government", "business", "for_profit")
            ):
                bits.append(
                    f"{pname}: REGRESSION for-profit/gov no→{cand_r}"
                )
            elif prod_r == "no" and cand_r in ("strong_yes", "weak_yes"):
                bits.append(f"{pname}: IMPROVE? sse {prod_r}→{cand_r}")
            else:
                bits.append(f"{pname}≠prod:{','.join(misses)}")
        else:
            bits.append(f"{pname}≠prod:{','.join(misses)}")
    return "; ".join(bits)


def note_job(report: dict) -> str:
    bits = []
    for pname in PROVIDERS:
        c = report[pname]
        if c.get("error"):
            bits.append(f"{pname} err")
            continue
        misses = [f for f in JOB_STRUCT if not field_match(report["prod"], c, f)]
        if not misses:
            bits.append(f"{pname}=prod")
            continue
        prod_r = report["prod"].get("sse_rating")
        cand_r = c.get("sse_rating")
        prod_sse = report["prod"].get("is_sse")
        cand_sse = c.get("is_sse")
        if prod_sse is True and cand_sse is False:
            bits.append(f"{pname}: REGRESSION {prod_r}→{cand_r}")
        elif prod_sse is False and cand_sse is True:
            bits.append(f"{pname}: IMPROVE? {prod_r}→{cand_r}")
        else:
            bits.append(f"{pname}≠prod:{','.join(misses)} ({prod_r}→{cand_r})")
    return "; ".join(bits)


def write_md(summary: dict) -> None:
    lines: list[str] = []
    lines.append("# 3-way parity v3: prod | gemini+tav | groq+tav")
    lines.append("")
    lines.append(f"Generated: `{summary['generated_at']}`")
    lines.append("")
    lines.append(
        "Setup: post-prompt-fix retest on same v2 IDs; Tavily-always "
        "(`FORCE_GROUNDING=1`, `USE_GOOGLE_SEARCH_GROUNDING=0`); Gemini-only then "
        "Groq-70b-only; Ollama skipped; no Cerebras; no prod writes."
    )
    lines.append("")
    lines.append(f"Models: `{json.dumps(summary['models'])}`")
    lines.append("")
    lines.append("## Headline")
    lines.append("")
    lines.append(summary.get("verdict") or "")
    lines.append("")
    lines.append("## Orgs (3)")
    lines.append("")
    lines.append("| Org | Prod | Gemini+T | Groq+T | vs prod / notes |")
    lines.append("|---|---|---|---|---|")
    for o in summary["orgs"]:
        name = o["name"]
        notes = o.get("notes") or ""
        lines.append(
            f"| {name} ({o['org_id']}) | `{fmt_cell(o['prod'], kind='org')}` "
            f"| `{fmt_cell(o['gemini'], kind='org')}` "
            f"| `{fmt_cell(o['groq'], kind='org')}` | {notes} |"
        )
    lines.append("")
    lines.append("### Org structural detail")
    lines.append("")
    for o in summary["orgs"]:
        lines.append(f"**{o['name']}** — prod location `{o['prod'].get('location')}`")
        lines.append("")
        lines.append("| field | Prod | Gemini+T | Groq+T |")
        lines.append("|---|---|---|---|")
        for f in ORG_STRUCT:
            if f == "location":
                lines.append(
                    f"| location | {o['prod'].get('location')} | (from prod geo) | (from prod geo) |"
                )
                continue
            pv = o["prod"].get("website_norm" if f == "website" else f)
            if f == "website":
                gv = o["gemini"].get("website_norm") or _host(o["gemini"].get("website"))
                qv = o["groq"].get("website_norm") or _host(o["groq"].get("website"))
            else:
                gv = o["gemini"].get(f)
                qv = o["groq"].get(f)
            lines.append(f"| {f} | {pv} | {gv} | {qv} |")
        lines.append("")

    lines.append("## Jobs (3)")
    lines.append("")
    lines.append("| Job | Prod | Gemini+T | Groq+T | vs prod / notes |")
    lines.append("|---|---|---|---|---|")
    for j in summary["jobs"]:
        label = f"{j['title'][:40]} @ {j['organization']}"
        notes = j.get("notes") or ""
        lines.append(
            f"| {label} | `{fmt_cell(j['prod'], kind='job')}` "
            f"| `{fmt_cell(j['gemini'], kind='job')}` "
            f"| `{fmt_cell(j['groq'], kind='job')}` | {notes} |"
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
    r = summary["rates"]["org_vs_gemini"]["groq"]
    cells = [f"{r['_overall']['pct']}%"]
    for f in ORG_STRUCT:
        if f == "location":
            continue
        cells.append(f"{r[f]['pct']}% ({r[f]['matches']}/{r[f]['total']})")
    lines.append(f"| groq+tav | " + " | ".join(cells) + " |")
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
    r = summary["rates"]["job_vs_gemini"]["groq"]
    lines.append(
        f"| groq+tav | {r['_overall']['pct']}% | "
        f"{r['sse_rating']['pct']}% ({r['sse_rating']['matches']}/{r['sse_rating']['total']}) | "
        f"{r['is_sse']['pct']}% ({r['is_sse']['matches']}/{r['is_sse']['total']}) |"
    )
    lines.append("")
    OUT_MD.write_text("\n".join(lines))
    logger.info("Wrote %s", OUT_MD)


def build_verdict(summary: dict) -> str:
    op = summary["rates"]["org_vs_prod"]
    jp = summary["rates"]["job_vs_prod"]
    og = summary["rates"]["org_vs_gemini"]
    jg = summary["rates"]["job_vs_gemini"]

    bits = []
    bits.append(
        f"- **Gemini+T ↔ prod**: orgs {op['gemini']['_overall']['pct']}%, "
        f"jobs {jp['gemini']['_overall']['pct']}%."
    )
    bits.append(
        f"- **Groq+T ↔ prod**: orgs {op['groq']['_overall']['pct']}%, "
        f"jobs {jp['groq']['_overall']['pct']}%."
    )
    bits.append(
        f"- **Groq+T ↔ Gemini+T**: orgs {og['groq']['_overall']['pct']}%, "
        f"jobs {jg['groq']['_overall']['pct']}%."
    )

    improves = []
    regressions = []
    for o in summary["orgs"]:
        for p in PROVIDERS:
            n = o.get("notes") or ""
            if f"{p}: IMPROVE" in n:
                improves.append(f"org {o['name']} ({p})")
            if f"{p}: REGRESSION" in n:
                regressions.append(f"org {o['name']} ({p})")
    for j in summary["jobs"]:
        for p in PROVIDERS:
            n = j.get("notes") or ""
            if f"{p}: IMPROVE" in n:
                improves.append(f"job {j['title'][:30]} @ {j['organization']} ({p})")
            if f"{p}: REGRESSION" in n:
                regressions.append(f"job {j['title'][:30]} @ {j['organization']} ({p})")

    if improves:
        bits.append("- **Possible improvements vs prod**: " + "; ".join(improves) + ".")
    if regressions:
        bits.append("- **Regressions vs prod**: " + "; ".join(regressions) + ".")
    if not improves and not regressions:
        bits.append(
            "- No clear is_sse polarity flips vs prod in this sample "
            "(strength/type/sector/website diffs may still exist — see tables)."
        )

    g_org = op["gemini"]["_overall"]["pct"]
    q_org = op["groq"]["_overall"]["pct"]
    if g_org is not None and q_org is not None:
        if g_org >= 70 and q_org >= 70:
            bits.append(
                "- **Verdict**: Tavily+Gemini / Tavily+Groq largely **match** prod "
                "structural fields on this fresh sample."
            )
        elif max(g_org, q_org) >= 70:
            better = "Gemini" if g_org >= q_org else "Groq"
            bits.append(
                f"- **Verdict**: Mixed — {better}+Tavily closer to prod; "
                "review per-row notes for improvements vs regressions."
            )
        else:
            bits.append(
                "- **Verdict**: Material divergence from prod — inspect whether "
                "Tavily grounding corrects old Gemini-grounding mistakes or regresses."
            )
    return "\n".join(bits)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prod", action="store_true")
    parser.add_argument("--sleep", type=float, default=8.0, help="Seconds between provider calls")
    parser.add_argument("--org-ids", type=str, default="", help="Comma-separated org ids")
    parser.add_argument("--job-ids", type=str, default="", help="Comma-separated job uuids")
    args = parser.parse_args()

    reset_supabase_client_cache()

    # Re-load LLM keys only (dotenv_values strips # comments; leaves SUPABASE_* alone).
    lengths = _reload_llm_keys_from_monorepo()
    gemini_key = get_gemini_api_key()
    groq_key = get_groq_api_key()
    if not gemini_key:
        raise SystemExit("settings.get_gemini_api_key() returned empty")
    if not groq_key:
        raise SystemExit("settings.get_groq_api_key() returned empty")
    # Fingerprint only — never print secrets / comment tails
    logger.info(
        "Reloaded LLM keys via dotenv_values(%s): gemini_len=%d groq_len=%d "
        "groq_prefix=%s keys=%s",
        _MONOREPO_ENV,
        len(gemini_key),
        len(groq_key),
        groq_key[:6],
        sorted(lengths),
    )
    if "#" in groq_key or groq_key.endswith(" "):
        raise SystemExit(
            "GROQ_API_KEY looks contaminated (comment or trailing space) — "
            "use python-dotenv dotenv_values, not naive parse"
        )

    logger.info("GROQ_MODELS=%s", GROQ_MODELS)
    if not GROQ_MODELS:
        raise SystemExit("GROQ_MODELS empty on this branch")
    if "70b" not in GROQ_MODELS[0]:
        logger.warning("Primary GROQ model is not 70b: %s", GROQ_MODELS[0])

    models = {
        "gemini": gemini_sse_primary_model(),
        "groq": "llama-3.3-70b-versatile",
        "env_reload": str(_MONOREPO_ENV),
    }
    logger.info("models=%s", models)

    org_ids = (
        [int(x.strip()) for x in args.org_ids.split(",") if x.strip()]
        if args.org_ids
        else list(ORG_IDS)
    )
    job_ids = (
        [x.strip() for x in args.job_ids.split(",") if x.strip()]
        if args.job_ids
        else list(JOB_IDS)
    )
    if not job_ids:
        raise SystemExit("Pass --job-ids (3 job UUIDs)")

    orgs = [fetch_org(i) for i in org_ids]
    jobs = [fetch_job(i) for i in job_ids]
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
        report["notes"] = note_org(report)
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
        report["notes"] = note_job(report)
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
    rates["org_vs_gemini"]["groq"] = match_rate(
        [(r["gemini"], r["groq"]) for r in org_reports], ORG_STRUCT
    )
    rates["job_vs_gemini"]["groq"] = match_rate(
        [(r["gemini"], r["groq"]) for r in job_reports], JOB_STRUCT
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

    print("\n======== HEADLINE ========")
    print(summary["verdict"])
    print("\n======== ORGS ========")
    for o in org_reports:
        print(
            f"| {o['name']} ({o['org_id']}) | {fmt_cell(o['prod'], kind='org')} | "
            f"{fmt_cell(o['gemini'], kind='org')} | {fmt_cell(o['groq'], kind='org')} | "
            f"{o['notes']} |"
        )
    print("\n======== JOBS ========")
    for j in job_reports:
        print(
            f"| {j['title'][:40]} @ {j['organization']} | {fmt_cell(j['prod'], kind='job')} | "
            f"{fmt_cell(j['gemini'], kind='job')} | {fmt_cell(j['groq'], kind='job')} | "
            f"{j['notes']} |"
        )
    print(f"\nLog: {LOG_PATH}")
    print(f"MD:  {OUT_MD}")
    print(f"JSON:{OUT_JSON}")


if __name__ == "__main__":
    main()
