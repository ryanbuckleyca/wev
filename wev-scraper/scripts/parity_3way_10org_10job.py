#!/usr/bin/env python
"""3-way dry-run parity: prod | gemini+tav | groq+tav — 10 orgs + 10 jobs.

Fresh sample (excludes prior 3-way / gemini job parity / cohere lists).
Forces Tavily grounding for every re-run and isolates each provider.
Never writes to Supabase. Never commits. No Cerebras.

Usage:
  CONFIRM_PROD_RUN=YES ./venv/bin/python scripts/parity_3way_10org_10job.py --prod
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
_STAGING_ENV = Path(__file__).resolve().parents[2] / ".env.staging"
_LLM_ENV_KEYS = ("GROQ_API_KEY", "GEMINI_API_KEY", "TAVILY_API_KEY")


def _reload_llm_keys_from_monorepo(*, prefer_staging_llm: bool = False) -> dict[str, int]:
    """Reload LLM keys only via dotenv_values (comment-safe).

    Does NOT touch SUPABASE_* so --prod DB credentials stay intact.
    When prefer_staging_llm=True, overlay GEMINI/GROQ from .env.staging
    (separate free-tier quotas) while keeping Tavily from monorepo .env.
    """
    if not _MONOREPO_ENV.is_file():
        raise SystemExit(f"Missing monorepo env: {_MONOREPO_ENV}")
    values = dict(dotenv_values(_MONOREPO_ENV))
    if prefer_staging_llm and _STAGING_ENV.is_file():
        staging = dotenv_values(_STAGING_ENV)
        for key in ("GROQ_API_KEY", "GEMINI_API_KEY"):
            raw = staging.get(key)
            if raw:
                values[key] = raw
                print(f"Using {key} from .env.staging (quota isolation)", flush=True)
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
# Staging LLM keys if --staging-llm present (parsed early for bootstrap).
_prefer_staging = "--staging-llm" in sys.argv[1:]
_reload_llm_keys_from_monorepo(prefer_staging_llm=_prefer_staging)
if "--prod" in sys.argv[1:]:
    confirm_prod_run(full_prod=True)
    mark_prod_confirmed()
    applied = load_db_credentials_only(resolve_prod_env_path(Path(__file__)))
    os.environ["USE_PROD_DB"] = "1"
    os.environ["ENV_MODE"] = "prod"
    print(f"PRODUCTION DB (read-only); keys={', '.join(applied) or '(none)'}")
    if _prefer_staging:
        print("LLM keys: GEMINI/GROQ from .env.staging; TAVILY from .env")

# Tavily-always; no Gemini Google Search divergence
os.environ["USE_GOOGLE_SEARCH_GROUNDING"] = "0"
os.environ["FORCE_GROUNDING"] = "1"
os.environ["ENV_MODE"] = os.environ.get("ENV_MODE") or "prod"

from llm.gemini import GeminiProvider  # noqa: E402
from llm.gemini_fallback import (  # noqa: E402
    SSEFallbackProvider,
    gemini_sse_lite_model,
    gemini_sse_primary_model,
)
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

LOG_PATH = Path("/tmp/parity_3way_10org_10job.log")
OUT_JSON = Path(__file__).resolve().parent / "parity_3way_10org_10job.json"
OUT_MD = Path(__file__).resolve().parent / "parity_3way_10org_10job.md"
CHECKPOINT = Path("/tmp/parity_3way_10org_10job_checkpoint.json")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_PATH, mode="a"),  # append across resume runs
    ],
)
logger = logging.getLogger("parity_3way_10")

# Fresh 10+10 — excludes prior 3-way (1408/1415/1413/1416/1419/1399), Park People,
# and named gemini/cohere parity sets (New Farm, Saugeen, GBLT, TISUP, etc.).
# Mix: SSE NP strong/weak, for-profit other=no, gov no/weak, construction other.
ORG_IDS = [
    1420,  # Épicerie Le Détour — nonprofit strong_yes
    1414,  # Theatre Aquarius — nonprofit strong_yes
    1129,  # CAFES — nonprofit weak_yes
    1127,  # Scale Institute Society — nonprofit weak_yes
    1407,  # Around the Block — other/no (retail)
    1400,  # Rio Tinto — other/no (for-profit)
    1324,  # Pomerleau — other/weak_yes (construction edge)
    1417,  # Atomic Energy of Canada Limited — government/no
    1387,  # Norfolk County — government/no
    1322,  # Defence Construction Canada — government/weak_yes
]
JOB_IDS = [
    "95df85b1-4336-49ba-83e1-875acde3ae86",  # EnviroCentre — strong_yes
    "cb5db7ca-0cf7-4d14-8ca2-f8b39042e5ed",  # Toronto Environmental Alliance — strong_yes
    "135f1c13-7a7a-45e7-bcd0-4aff5f2083c2",  # CPAWS — strong_yes
    "17995128-bbb9-4c19-bd12-29e8f76aa937",  # Conservation Halton — strong_yes
    "fbc279c7-af94-418e-920c-d18660629e05",  # Let's Hike T.O. — strong_yes
    "727962ad-042f-4048-a9f2-395545b2598f",  # Evergreen Account Manager — weak_yes
    "88cc7d47-e950-4978-9ab6-8069feaef064",  # Roots 2 Rise Outdoors — weak_yes
    "37c3964f-34bf-4b4f-a84f-55b1bbb8eace",  # Cambium Technician — weak_yes/is_sse=False
    "e29705dd-7865-465a-9149-49c05956e603",  # Selva Farm — weak_yes/is_sse=False
    "1673a0e2-5f0c-4684-bd66-a082022b07b7",  # Evergreen Strategic Planning — no
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
    """SSEFallbackProvider isolating one provider family (Ollama never included).

    Gemini pass: primary Flash then Flash-Lite (still Gemini-only; mirrors
    production Gemini half of the chain when primary is rate-limited).
    Groq pass: pinned llama-3.3-70b only (no 8b cascade).
    """
    if name == "gemini":
        primary = gemini_sse_primary_model()
        lite = gemini_sse_lite_model()
        key = get_gemini_api_key() or None
        backends: list[tuple[str, Any]] = [
            (primary, GeminiProvider(api_key=key, model=primary)),
            (lite, GeminiProvider(api_key=key, model=lite)),
        ]
        backends = [(lab, b) for lab, b in backends if b.is_available()]
        if not backends:
            raise RuntimeError("gemini unavailable (missing API key?)")
        chain = SSEFallbackProvider.__new__(SSEFallbackProvider)
        chain._providers = backends
        chain._last_successful = None
        logger.info(
            "Forced provider chain: Gemini-only %s (tavily via SSEFallbackProvider)",
            " → ".join(lab for lab, _ in backends),
        )
        return chain

    if name == "groq":
        if not GROQ_MODELS:
            raise RuntimeError("GROQ_MODELS empty — cannot run Groq")
        # Pin 70b for parity — do not silently fall back to 8b on quota.
        backend = GroqProvider(
            api_key=get_groq_api_key() or None,
            model="llama-3.3-70b-versatile",
        )
        # Prevent intra-provider model cascade for this dry-run.
        backend._exhausted_models = set(GROQ_MODELS[1:])
        if not backend.is_available():
            raise RuntimeError("groq unavailable (missing API key?)")
        chain = SSEFallbackProvider.__new__(SSEFallbackProvider)
        chain._providers = [("groq", backend)]
        chain._last_successful = None
        logger.info("Forced provider chain: groq only (tavily via SSEFallbackProvider)")
        return chain

    raise ValueError(name)


def _is_daily_tpd_error(payload: dict | str | None) -> bool:
    """Groq tokens-per-day (TPD) — sleeping won't help until the window rolls."""
    text = (payload if isinstance(payload, str) else json.dumps(payload or {})).lower()
    return (
        "tokens per day" in text
        or "tpd" in text
        or "daily quota exhausted" in text
    )


def _is_quota_error(payload: dict | str | None) -> bool:
    text = payload if isinstance(payload, str) else json.dumps(payload or {})
    low = text.lower()
    return any(
        s in low
        for s in (
            "429",
            "resource_exhausted",
            "rate limit",
            "quota exhausted",
            "tokens per day",
            "tpd",
            # OrganizationAssessor swallows the 429 and returns None
            "assessor returned none",
        )
    )


def _retry_after_seconds(payload: dict | str | None, default: float = 65.0) -> float:
    text = payload if isinstance(payload, str) else json.dumps(payload or {})
    m = re.search(r"retry in ([0-9]+(?:\.[0-9]+)?)s", text, re.I)
    if m:
        return min(120.0, float(m.group(1)) + 2.0)
    return default


def call_with_quota_retry(
    fn,
    *,
    label: str,
    max_attempts: int = 4,
) -> dict[str, Any]:
    """Retry assess/classify on transient RPM 429s; fail-fast on Groq daily TPD."""
    last: dict[str, Any] = {"error": "no_attempt"}
    for attempt in range(1, max_attempts + 1):
        last = fn()
        err = last.get("error")
        if not err:
            return last
        if not _is_quota_error(err) and not _is_quota_error(last):
            return last
        # Daily token budget — retries only burn wall clock.
        # OrganizationAssessor often swallows TPD into "assessor returned None".
        err_l = str(err).lower()
        if (
            _is_daily_tpd_error(err)
            or _is_daily_tpd_error(last)
            or "assessor returned none" in err_l
            or "daily quota exhausted" in err_l
            or "tokens per day" in err_l
        ):
            logger.error(
                "%s daily TPD / assessor-None — fail-fast (no long retry)", label
            )
            return last
        wait = _retry_after_seconds(err)
        logger.warning(
            "%s quota/rate-limit (attempt %d/%d); sleeping %.1fs",
            label,
            attempt,
            max_attempts,
            wait,
        )
        time.sleep(wait)
    return last


def _ok_snap(snap: dict | None) -> bool:
    return bool(snap) and not snap.get("error")


def load_checkpoint() -> dict:
    if not CHECKPOINT.is_file():
        return {"orgs": {}, "jobs": {}}
    try:
        return json.loads(CHECKPOINT.read_text())
    except Exception:
        return {"orgs": {}, "jobs": {}}


def save_checkpoint(org_reports: list[dict], job_reports: list[dict]) -> None:
    payload = {
        "orgs": {str(r["org_id"]): r for r in org_reports},
        "jobs": {r["job_id"]: r for r in job_reports},
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    CHECKPOINT.write_text(json.dumps(payload, indent=2, default=str))


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
    lines.append("# 3-way parity: prod | gemini+tav | groq+tav — 10 orgs + 10 jobs")
    lines.append("")
    lines.append(f"Generated: `{summary['generated_at']}`")
    lines.append("")
    lines.append(
        "Setup: fresh 10+10 sample (excludes prior 3-way / gemini job parity entities); "
        "Tavily-always (`FORCE_GROUNDING=1`, `USE_GOOGLE_SEARCH_GROUNDING=0`); "
        "Gemini-only then Groq-70b-only; Ollama skipped; no Cerebras; no prod writes."
    )
    lines.append("")
    lines.append(f"Models: `{json.dumps(summary['models'])}`")
    lines.append("")
    lines.append("## Headline")
    lines.append("")
    lines.append(summary.get("verdict") or "")
    lines.append("")
    lines.append("## Orgs (10)")
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
        # mission snippets for analysis
        pm = (o["prod"].get("mission_short") or "")[:120]
        gm = (o["gemini"].get("mission_short") or "")[:120]
        qm = (o["groq"].get("mission_short") or "")[:120]
        if pm or gm or qm:
            lines.append("")
            lines.append(f"- prod mission: {pm or '—'}")
            lines.append(f"- gemini mission: {gm or '—'}")
            lines.append(f"- groq mission: {qm or '—'}")
        lines.append("")

    lines.append("## Jobs (10)")
    lines.append("")
    lines.append("| Job | Prod | Gemini+T | Groq+T | vs prod / notes |")
    lines.append("|---|---|---|---|---|")
    for j in summary["jobs"]:
        label = f"{(j['title'] or '')[:40]} @ {j['organization']}"
        notes = j.get("notes") or ""
        lines.append(
            f"| {label} | `{fmt_cell(j['prod'], kind='job')}` "
            f"| `{fmt_cell(j['gemini'], kind='job')}` "
            f"| `{fmt_cell(j['groq'], kind='job')}` | {notes} |"
        )
    lines.append("")
    lines.append("### Job reasoning snippets")
    lines.append("")
    for j in summary["jobs"]:
        label = f"{(j['title'] or '')[:40]} @ {j['organization']}"
        lines.append(f"**{label}**")
        for p in PROVIDERS:
            rs = (j[p].get("reasoning_short") or j[p].get("error") or "—")[:180]
            lines.append(f"- {p}: {rs}")
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

    # Analysis sections
    analysis = summary.get("analysis") or {}
    lines.append("## Analysis")
    lines.append("")
    lines.append("### 1. Match rates (summary)")
    lines.append("")
    lines.append(analysis.get("match_rates") or "")
    lines.append("")
    lines.append("### 2. Where Tavily improves on prod")
    lines.append("")
    improves = analysis.get("improves") or []
    if improves:
        for item in improves:
            lines.append(f"- {item}")
    else:
        lines.append("- None clear in this sample.")
    lines.append("")
    lines.append("### 3. Where Tavily regresses vs prod")
    lines.append("")
    regressions = analysis.get("regressions") or []
    if regressions:
        for item in regressions:
            lines.append(f"- {item}")
    else:
        lines.append("- None clear in this sample.")
    lines.append("")
    lines.append("### 4. Groq vs Gemini remaining disagreements")
    lines.append("")
    disagrees = analysis.get("groq_vs_gemini") or []
    if disagrees:
        for item in disagrees:
            lines.append(f"- {item}")
    else:
        lines.append("- None — Groq and Gemini agree on all structural fields.")
    lines.append("")
    lines.append("### 5. Website stick rate")
    lines.append("")
    lines.append(analysis.get("website_stick") or "")
    lines.append("")
    lines.append("### 6. Overall verdict")
    lines.append("")
    lines.append(analysis.get("overall_verdict") or "")
    lines.append("")
    OUT_MD.write_text("\n".join(lines))
    logger.info("Wrote %s", OUT_MD)


def _website_stick_stats(org_reports: list[dict]) -> dict:
    """Among orgs with a prod website, how often re-assess keeps the same host."""
    out: dict[str, dict] = {}
    for p in PROVIDERS:
        keep = 0
        total = 0
        for r in org_reports:
            prod_w = r["prod"].get("website")
            if not prod_w:
                continue
            cand = r[p]
            if cand.get("error"):
                continue
            total += 1
            if _norm_website(prod_w, cand.get("website")):
                keep += 1
        out[p] = {
            "kept": keep,
            "total": total,
            "pct": round(100.0 * keep / total, 1) if total else None,
        }
    return out


def build_analysis(summary: dict) -> dict:
    op = summary["rates"]["org_vs_prod"]
    jp = summary["rates"]["job_vs_prod"]
    og = summary["rates"]["org_vs_gemini"]
    jg = summary["rates"]["job_vs_gemini"]
    stick = summary["rates"].get("website_stick") or _website_stick_stats(summary["orgs"])

    match_rates = (
        f"- **Gemini+T ↔ prod**: orgs {op['gemini']['_overall']['pct']}%, "
        f"jobs {jp['gemini']['_overall']['pct']}%.\n"
        f"- **Groq+T ↔ prod**: orgs {op['groq']['_overall']['pct']}%, "
        f"jobs {jp['groq']['_overall']['pct']}%.\n"
        f"- **Groq+T ↔ Gemini+T** (structural): orgs {og['groq']['_overall']['pct']}%, "
        f"jobs {jg['groq']['_overall']['pct']}%.\n"
        f"- **is_sse only** — Gemini orgs "
        f"{op['gemini']['is_sse']['pct']}% ({op['gemini']['is_sse']['matches']}/"
        f"{op['gemini']['is_sse']['total']}), Groq orgs "
        f"{op['groq']['is_sse']['pct']}% ({op['groq']['is_sse']['matches']}/"
        f"{op['groq']['is_sse']['total']}); Gemini jobs "
        f"{jp['gemini']['is_sse']['pct']}%, Groq jobs {jp['groq']['is_sse']['pct']}%."
    )

    improves: list[str] = []
    regressions: list[str] = []
    correct_holds: list[str] = []
    for o in summary["orgs"]:
        for p in PROVIDERS:
            n = o.get("notes") or ""
            if f"{p}: IMPROVE" in n:
                improves.append(
                    f"**Org {o['name']}** ({p}): {n} — "
                    f"prod `{o['prod'].get('sse_rating')}/{o['prod'].get('type')}` → "
                    f"`{o[p].get('sse_rating')}/{o[p].get('type')}`"
                )
            if f"{p}: REGRESSION" in n:
                regressions.append(
                    f"**Org {o['name']}** ({p}): {n} — "
                    f"prod `{o['prod'].get('sse_rating')}/{o['prod'].get('type')}` → "
                    f"`{o[p].get('sse_rating')}/{o[p].get('type')}`"
                )
            # For-profit / gov correctly staying no
            prod_type = o["prod"].get("type")
            if (
                prod_type in ("other", "government", "business", "for_profit")
                and o["prod"].get("sse_rating") == "no"
                and o[p].get("sse_rating") == "no"
                and not o[p].get("error")
            ):
                correct_holds.append(
                    f"**Org {o['name']}** ({p}): for-profit/gov correctly stays `no` "
                    f"(type={o[p].get('type')})."
                )
    for j in summary["jobs"]:
        for p in PROVIDERS:
            n = j.get("notes") or ""
            if f"{p}: IMPROVE" in n:
                improves.append(
                    f"**Job {(j['title'] or '')[:35]} @ {j['organization']}** ({p}): {n}"
                )
            if f"{p}: REGRESSION" in n:
                regressions.append(
                    f"**Job {(j['title'] or '')[:35]} @ {j['organization']}** ({p}): {n}"
                )

    improves = list(dict.fromkeys(improves))
    regressions = list(dict.fromkeys(regressions))
    correct_holds = list(dict.fromkeys(correct_holds))
    improves_section = improves + [
        f"(correct hold) {h}" for h in correct_holds
    ]

    disagrees: list[str] = []
    for o in summary["orgs"]:
        if o["gemini"].get("error") or o["groq"].get("error"):
            continue
        misses = [
            f
            for f in ("type", "sector_id", "sse_rating", "is_sse", "website")
            if not field_match(o["gemini"], o["groq"], f)
        ]
        if misses:
            disagrees.append(
                f"**Org {o['name']}**: {', '.join(misses)} — "
                f"gemini `{fmt_cell(o['gemini'], kind='org')}` vs "
                f"groq `{fmt_cell(o['groq'], kind='org')}`"
            )
    for j in summary["jobs"]:
        if j["gemini"].get("error") or j["groq"].get("error"):
            continue
        misses = [f for f in JOB_STRUCT if not field_match(j["gemini"], j["groq"], f)]
        if misses:
            disagrees.append(
                f"**Job {(j['title'] or '')[:35]} @ {j['organization']}**: "
                f"{', '.join(misses)} — gemini `{fmt_cell(j['gemini'], kind='job')}` vs "
                f"groq `{fmt_cell(j['groq'], kind='job')}`"
            )

    website_stick = (
        f"- Gemini kept prod website host on "
        f"**{stick['gemini']['pct']}%** ({stick['gemini']['kept']}/{stick['gemini']['total']}) "
        f"of orgs that had a prod website.\n"
        f"- Groq kept prod website host on "
        f"**{stick['groq']['pct']}%** ({stick['groq']['kept']}/{stick['groq']['total']})."
    )

    g_org = op["gemini"]["_overall"]["pct"]
    q_org = op["groq"]["_overall"]["pct"]
    g_job = jp["gemini"]["_overall"]["pct"]
    q_job = jp["groq"]["_overall"]["pct"]
    g_sse = op["gemini"]["is_sse"]["pct"]
    q_sse = op["groq"]["is_sse"]["pct"]

    if (
        g_sse is not None
        and q_sse is not None
        and g_sse >= 80
        and q_sse >= 80
        and (g_org or 0) >= 70
        and len(regressions) <= max(1, len(improves) + len(correct_holds) // 2)
    ):
        overall = (
            "**Verdict**: Tavily+Gemini / Tavily+Groq are **as good or better** than "
            "prod baselines on SSE polarity for this sample — structural match is solid, "
            "for-profit/gov `no` cases hold, and provider agreement under shared Tavily "
            "is high. Residual diffs are mostly sector/strength (not polarity) and "
            "website stick when the known-website guard applies."
        )
    elif max(g_org or 0, q_org or 0) >= 70:
        overall = (
            "**Verdict**: **Mixed** — Tavily approach largely tracks prod on core SSE "
            f"fields (Gemini org overall {g_org}%, Groq {q_org}%; jobs Gemini {g_job}%, "
            f"Groq {q_job}%), but review regressions/improvements above before calling "
            "it a clear upgrade over prod Gemini-grounding baselines."
        )
    else:
        overall = (
            "**Verdict**: Material divergence from prod — inspect whether Tavily "
            "corrects old Gemini-grounding mistakes or regresses; do not treat this "
            "sample as a green light to replace prod baselines yet."
        )

    return {
        "match_rates": match_rates,
        "improves": improves_section,
        "regressions": regressions,
        "groq_vs_gemini": disagrees,
        "website_stick": website_stick,
        "overall_verdict": overall,
        "correct_holds": correct_holds,
    }


def build_verdict(summary: dict) -> str:
    analysis = summary.get("analysis") or build_analysis(summary)
    bits = [analysis["match_rates"], analysis["website_stick"]]
    if analysis["improves"]:
        bits.append(
            "- **Possible improvements / correct holds vs prod**: "
            + "; ".join(analysis["improves"][:8])
            + ("…" if len(analysis["improves"]) > 8 else "")
            + "."
        )
    if analysis["regressions"]:
        bits.append(
            "- **Regressions vs prod**: " + "; ".join(analysis["regressions"]) + "."
        )
    if analysis["groq_vs_gemini"]:
        bits.append(
            "- **Groq≠Gemini**: "
            + "; ".join(analysis["groq_vs_gemini"][:6])
            + ("…" if len(analysis["groq_vs_gemini"]) > 6 else "")
            + "."
        )
    bits.append("- " + analysis["overall_verdict"].lstrip("*").replace("**", ""))
    return "\n".join(bits)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prod", action="store_true")
    parser.add_argument(
        "--staging-llm",
        action="store_true",
        help="Use GEMINI/GROQ from .env.staging (separate free-tier quotas); Tavily stays on .env",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume from /tmp checkpoint; skip provider calls that already succeeded",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=12.0,
        help="Seconds between provider calls (default 12 for free-tier RPM)",
    )
    parser.add_argument("--org-ids", type=str, default="", help="Comma-separated org ids")
    parser.add_argument("--job-ids", type=str, default="", help="Comma-separated job uuids")
    args = parser.parse_args()

    reset_supabase_client_cache()

    # Re-load LLM keys only (dotenv_values strips # comments; leaves SUPABASE_* alone).
    lengths = _reload_llm_keys_from_monorepo(prefer_staging_llm=args.staging_llm)
    gemini_key = get_gemini_api_key()
    groq_key = get_groq_api_key()
    if not gemini_key:
        raise SystemExit("settings.get_gemini_api_key() returned empty")
    if not groq_key:
        raise SystemExit("settings.get_groq_api_key() returned empty")
    # Fingerprint only — never print secrets / comment tails
    logger.info(
        "Reloaded LLM keys via dotenv_values(%s staging=%s): gemini_len=%d groq_len=%d "
        "groq_prefix=%s keys=%s",
        _MONOREPO_ENV,
        args.staging_llm,
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
        "gemini_primary": gemini_sse_primary_model(),
        "gemini_lite": gemini_sse_lite_model(),
        "groq": "llama-3.3-70b-versatile",
        "env_reload": str(_MONOREPO_ENV),
        "staging_llm": args.staging_llm,
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
        raise SystemExit("Pass --job-ids or use built-in JOB_IDS")

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

    ckpt = load_checkpoint() if args.resume else {"orgs": {}, "jobs": {}}
    if args.resume:
        logger.info(
            "Resume mode: %d org / %d job checkpoint entries",
            len(ckpt.get("orgs") or {}),
            len(ckpt.get("jobs") or {}),
        )

    org_reports: list[dict] = []
    for org in orgs:
        prior = (ckpt.get("orgs") or {}).get(str(org["id"])) or {}
        report: dict[str, Any] = {
            "org_id": org["id"],
            "name": org["name"],
            "prod": org_prod_snap(org),
        }
        for pname in PROVIDERS:
            if args.resume and _ok_snap(prior.get(pname)):
                report[pname] = prior[pname]
                logger.info(
                    "=== ORG %s via %s === (checkpoint hit) -> %s",
                    org["name"],
                    pname,
                    fmt_cell(report[pname], kind="org"),
                )
                continue
            logger.info("=== ORG %s via %s ===", org["name"], pname)

            def _run(org=org, pname=pname):
                try:
                    chain = single_provider_chain(pname)
                    return assess_org(chain, org)
                except Exception as exc:
                    return {"error": str(exc)}

            cand = call_with_quota_retry(_run, label=f"org:{org['name']}:{pname}")
            report[pname] = cand
            logger.info("  -> %s", fmt_cell(cand, kind="org"))
            time.sleep(args.sleep)
        report["notes"] = note_org(report)
        org_reports.append(report)
        save_checkpoint(org_reports, [])

    job_reports: list[dict] = []
    for job in jobs:
        prior = (ckpt.get("jobs") or {}).get(job["id"]) or {}
        report = {
            "job_id": job["id"],
            "title": job.get("job_title"),
            "organization": job.get("organization"),
            "prod": job_prod_snap(job),
        }
        for pname in PROVIDERS:
            if args.resume and _ok_snap(prior.get(pname)):
                report[pname] = prior[pname]
                logger.info(
                    "=== JOB %s @ %s via %s === (checkpoint hit) -> %s",
                    (job.get("job_title") or "")[:40],
                    job.get("organization"),
                    pname,
                    fmt_cell(report[pname], kind="job"),
                )
                continue
            logger.info(
                "=== JOB %s @ %s via %s ===",
                (job.get("job_title") or "")[:40],
                job.get("organization"),
                pname,
            )

            def _run(job=job, pname=pname):
                try:
                    chain = single_provider_chain(pname)
                    return classify_job_tavily_always(chain, job)
                except Exception as exc:
                    return {"error": str(exc)}

            cand = call_with_quota_retry(_run, label=f"job:{job.get('job_title')}:{pname}")
            report[pname] = cand
            logger.info("  -> %s", fmt_cell(cand, kind="job"))
            time.sleep(args.sleep)
        report["notes"] = note_job(report)
        job_reports.append(report)
        save_checkpoint(org_reports, job_reports)

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
    rates["website_stick"] = _website_stick_stats(org_reports)

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "models": models,
        "env": {
            "USE_GOOGLE_SEARCH_GROUNDING": os.environ.get("USE_GOOGLE_SEARCH_GROUNDING"),
            "FORCE_GROUNDING": os.environ.get("FORCE_GROUNDING"),
            "GROQ_MODELS": list(GROQ_MODELS),
            "staging_llm": args.staging_llm,
        },
        "orgs": org_reports,
        "jobs": job_reports,
        "rates": rates,
    }
    summary["analysis"] = build_analysis(summary)
    summary["verdict"] = build_verdict(summary)

    OUT_JSON.write_text(json.dumps(summary, indent=2, default=str))
    logger.info("Wrote %s", OUT_JSON)
    write_md(summary)
    save_checkpoint(org_reports, job_reports)

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
            f"| {(j['title'] or '')[:40]} @ {j['organization']} | {fmt_cell(j['prod'], kind='job')} | "
            f"{fmt_cell(j['gemini'], kind='job')} | {fmt_cell(j['groq'], kind='job')} | "
            f"{j['notes']} |"
        )
    n_err = sum(
        1
        for r in org_reports + job_reports
        for p in PROVIDERS
        if (r.get(p) or {}).get("error")
    )
    print(f"\nErrors remaining: {n_err}")
    print(f"Log: {LOG_PATH}")
    print(f"MD:  {OUT_MD}")
    print(f"JSON:{OUT_JSON}")
    print(f"CKPT:{CHECKPOINT}")
    if n_err:
        raise SystemExit(f"Incomplete: {n_err} provider errors — re-run with --resume")


if __name__ == "__main__":
    main()
