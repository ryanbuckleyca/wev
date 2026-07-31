#!/usr/bin/env python
r"""Dry-run: compare Groq OrganizationAssessor output to stored Gemini results.

Reads production organizations that already have Gemini assessments
(``sse_rating IS NOT NULL``), re-runs the same ``OrganizationAssessor`` path
with Groq only, and scores exact + semantic agreement.

Never writes to Supabase. Never calls Gemini.

Usage:
    CONFIRM_PROD_RUN=YES python scripts/compare_groq_org_assessment.py \\
        --prod --limit 25

    # Prefer prior mismatches from a previous run
    CONFIRM_PROD_RUN=YES python scripts/compare_groq_org_assessment.py \\
        --prod --limit 25 --prior-results scripts/groq_org_eval/baseline.json

    # Prompt label for changelog tracking (default: current)
    CONFIRM_PROD_RUN=YES python scripts/compare_groq_org_assessment.py \\
        --prod --limit 25 --prompt-version v0-baseline
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Allow `python scripts/compare_groq_org_assessment.py` from wev-scraper root.
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from settings import ensure_env_loaded, load_db_credentials_only  # noqa: E402
from utils.prod_env import (  # noqa: E402
    confirm_prod_run,
    mark_prod_confirmed,
    resolve_prod_env_path,
)

# Base .env first (GROQ_API_KEY etc.), then production DB credentials only.
ensure_env_loaded()
if "--prod" in sys.argv[1:]:
    confirm_prod_run(full_prod=True)
    mark_prod_confirmed()
    prod_env = resolve_prod_env_path(Path(__file__))
    if not prod_env.exists():
        print(f"❌ {prod_env} not found", file=sys.stderr)
        sys.exit(1)
    applied = load_db_credentials_only(prod_env)
    os.environ["USE_PROD_DB"] = "1"
    # Force non-local so language name-LLM does not route to Ollama.
    os.environ["ENV_MODE"] = "prod"
    print(
        f"Using PRODUCTION database (read-only); applied DB keys: {', '.join(applied) or '(none)'}"
    )
    print("LLM: Groq only (ENV_MODE=prod) — Gemini will not be called")
else:
    print("Using TEST database (read-only)")

from llm.groq import GroqProvider  # noqa: E402
from utils.db import supabase  # noqa: E402
from utils.organization_assessment import (  # noqa: E402
    OrganizationAssessor,
    _result_to_db_fields,
)
from utils.organization_cache import evidence_domain, extract_domain  # noqa: E402
from utils.organization_language import (  # noqa: E402
    VALID_ORG_LANGUAGES,
    classify_org_language,
)

# Prompt addenda live beside this harness (not production package).
sys.path.insert(0, str(Path(__file__).resolve().parent / "groq_org_eval"))
from prompt_addenda import get_prompt_addendum  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

_SELECT = (
    "id, name, location, municipality, province, website, description, "
    "description_en, description_fr, mission_statement, mission_statement_en, "
    "mission_statement_fr, values, values_list, sse_rating, is_sse, type, "
    "sector_id, language, sse_details"
)

_EXACT_FIELDS = ("is_sse", "sector", "language", "website")
_SEMANTIC_FIELDS = ("mission", "values", "description")

_TOKEN_RE = re.compile(r"[a-z0-9àâäæçéèêëïîôœùûüÿ]+", re.I)

# Prefer models that exist on this Groq account. llama-4-scout currently 404s.
_GROQ_EVAL_MODELS = (
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "qwen/qwen3-32b",
    "moonshotai/kimi-k2-instruct-0905",
)


def _groq_only_assessor(*, prefer_small: bool = False) -> OrganizationAssessor:
    """Build OrganizationAssessor wired only to Groq (no Gemini fallback)."""
    start = "llama-3.1-8b-instant" if prefer_small else "llama-3.3-70b-versatile"
    provider = GroqProvider(model=start)
    if not provider.is_available():
        raise RuntimeError("GROQ_API_KEY not set — cannot run Groq comparison")
    # Skip models known missing / wrong for this account.
    provider._exhausted_models.add("meta-llama/llama-4-scout-17b-16e-instruct")
    # Align fallback order with models we can actually call.
    from llm import groq as groq_mod

    groq_mod.GROQ_MODELS[:] = [m for m in _GROQ_EVAL_MODELS]
    if start in groq_mod.GROQ_MODELS:
        provider._current_model_index = groq_mod.GROQ_MODELS.index(start)
        provider._model = start
    assessor = OrganizationAssessor.__new__(OrganizationAssessor)
    assessor.provider = provider
    return assessor


def _attach_language_with_groq(
    row: dict,
    provider: GroqProvider,
    llm_public_language: str | None,
    *,
    fetch_web: bool,
) -> dict:
    """Attach language using website evidence + Groq assessor ``public_language``.

    Skips the separate name-LLM call (would double Groq TPM). Name leaning is
    already encoded in the assessor's ``public_language`` field.
    """
    del provider  # kept for call-site symmetry / future name-LLM option
    from utils.organization_assessment import _append_language_provenance_flags

    classification = classify_org_language(
        name=row.get("name"),
        website=row.get("website"),
        fetch_web=fetch_web,
        use_llm=False,
    )
    lang = classification.language

    # Prefer website bilingual / concrete web signal when present.
    if lang == "bilingual" or (
        lang and classification.source and classification.source.startswith("web")
    ):
        row["language"] = lang
        _append_language_provenance_flags(
            row,
            language=lang,
            via=classification.source,
            reasons=classification.reasons,
        )
        return row

    if llm_public_language in VALID_ORG_LANGUAGES:
        row["language"] = llm_public_language
        _append_language_provenance_flags(
            row,
            language=llm_public_language,
            via="public_language",
            reasons=classification.reasons,
        )
        return row

    if lang:
        row["language"] = lang
        _append_language_provenance_flags(
            row,
            language=lang,
            via=classification.source,
            reasons=classification.reasons,
        )
        return row

    _append_language_provenance_flags(
        row,
        language=None,
        via=classification.source or "unknown",
        reasons=classification.reasons or ("insufficient_signal",),
    )
    return row


def _normalize_website(url: str | None) -> str | None:
    domain = extract_domain(url)
    if not domain:
        return None
    return domain.lower()


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return " | ".join(str(v).strip() for v in value if v)
    text = str(value).strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def _tokens(text: str) -> set[str]:
    return {t for t in _TOKEN_RE.findall(text.lower()) if len(t) > 2}


def semantic_score(reference: Any, candidate: Any) -> int:
    """Heuristic 0/1/2 equivalence (no LLM judge — avoids Groq self-grading).

    2 = same meaning / high overlap or both empty
    1 = partial overlap
    0 = incorrect / hallucinated / one-sided empty
    """
    ref = _normalize_text(reference)
    cand = _normalize_text(candidate)
    if not ref and not cand:
        return 2
    if not ref or not cand:
        return 0
    if ref == cand:
        return 2

    ref_toks = _tokens(ref)
    cand_toks = _tokens(cand)
    if not ref_toks or not cand_toks:
        return 0

    overlap = ref_toks & cand_toks
    union = ref_toks | cand_toks
    jaccard = len(overlap) / len(union)
    recall = len(overlap) / len(ref_toks)
    precision = len(overlap) / len(cand_toks)

    # Softened thresholds: Gemini/Groq paraphrases often share ~25–40% tokens.
    if jaccard >= 0.28 or (recall >= 0.40 and precision >= 0.35):
        return 2
    if jaccard >= 0.12 or recall >= 0.22 or precision >= 0.22:
        return 1
    return 0


def _fetch_website_evidence(url: str | None, *, max_chars: int = 3500) -> str:
    """Best-effort public homepage text for ungrounded Groq (never raises)."""
    if not url or not evidence_domain(url):
        return ""
    try:
        from utils.organization_language import _html_to_text, _neutral_fetch

        html, _final = _neutral_fetch(url)
        if not html:
            return ""
        text = _html_to_text(html)
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) < 40:
            return ""
        return text[:max_chars]
    except Exception as exc:  # noqa: BLE001
        logger.debug("website evidence fetch failed for %s: %s", url, exc)
        return ""


def _install_prompt_addendum(prompt_version: str):
    """Patch ``_build_assessment_prompt`` to append versioned Groq rules."""
    import utils.organization_assessment as oa

    addendum = get_prompt_addendum(prompt_version)
    if not addendum.strip():
        return

    original = oa._build_assessment_prompt

    def _wrapped(*args, **kwargs):
        return original(*args, **kwargs) + "\n" + addendum

    oa._build_assessment_prompt = _wrapped  # type: ignore[assignment]
    logger.info("Installed prompt addendum for %s (%d chars)", prompt_version, len(addendum))


def _gemini_snapshot(org: dict) -> dict[str, Any]:
    return {
        "is_sse": org.get("is_sse"),
        "sector": org.get("sector_id"),
        "language": org.get("language"),
        "website": org.get("website"),
        "website_norm": _normalize_website(org.get("website")),
        "mission": org.get("mission_statement_en")
        or org.get("mission_statement")
        or org.get("mission_statement_fr"),
        "values": org.get("values_list") or org.get("values"),
        "description": org.get("description_en")
        or org.get("description")
        or org.get("description_fr"),
        "sse_rating": org.get("sse_rating"),
        "type": org.get("type"),
    }


def _groq_snapshot(updates: dict) -> dict[str, Any]:
    return {
        "is_sse": updates.get("is_sse"),
        "sector": updates.get("sector_id"),
        "language": updates.get("language"),
        "website": updates.get("website"),
        "website_norm": _normalize_website(updates.get("website")),
        "mission": updates.get("mission_statement_en")
        or updates.get("mission_statement")
        or updates.get("mission_statement_fr"),
        "values": updates.get("values_list") or updates.get("values"),
        "description": updates.get("description_en")
        or updates.get("description")
        or updates.get("description_fr"),
        "sse_rating": updates.get("sse_rating"),
        "type": updates.get("type"),
    }


def _assess_groq_only(
    assessor: OrganizationAssessor,
    org: dict,
    *,
    fetch_web: bool,
    inject_website_evidence: bool,
) -> dict | None:
    """Run existing assessor logic but do not fall back to Gemini field values.

    ``assess_and_build_update`` keeps prior website/language when Groq returns
    null — that would inflate agreement. For comparison we keep Groq's own
    website (or null) and force language from Groq ``public_language`` +
    classifier signals only.
    """
    name = org.get("name")
    if not name:
        return None
    known_website = org.get("website")
    description = ""
    web_evidence = ""
    if inject_website_evidence and known_website:
        evidence = _fetch_website_evidence(known_website)
        if evidence:
            web_evidence = evidence
            logger.info(
                "  injected website evidence (%d chars) from %s",
                len(evidence),
                known_website,
            )
    result = assessor.assess(
        raw_name=name,
        municipality=org.get("municipality"),
        province=org.get("province"),
        job_title="",
        description="",
        known_website=known_website,
        existing_description=org.get("description_en")
        or org.get("description_fr")
        or org.get("description")
        or "",
        listing_notes="",
        web_evidence=web_evidence or None,
    )
    if result is None:
        return None

    updates = _result_to_db_fields(result)
    known = known_website if known_website and evidence_domain(known_website) else None
    website = result.get("website")
    # Deterministic Groq guard (v2+): never keep an invented website when the
    # org had no known employer-owned URL — matches Gemini-null reference cases.
    if known:
        if website and evidence_domain(website):
            # Prefer known host when domains match; else keep model only if evidence-grade
            if extract_domain(website) == extract_domain(known):
                updates["website"] = known
            else:
                updates["website"] = website
        else:
            updates["website"] = known
    else:
        updates["website"] = None

    return _attach_language_with_groq(
        {
            "name": name,
            "language": None,
            **updates,
            "website": updates.get("website"),
        },
        assessor.provider,
        result.get("public_language"),
        fetch_web=fetch_web,
    )


def compare_pair(gemini: dict, groq: dict) -> dict[str, Any]:
    # is_sse: treat None as False (matches _result_to_db_fields derivation)
    exact = {
        "is_sse": bool(gemini["is_sse"]) == bool(groq["is_sse"]),
        "sector": gemini["sector"] == groq["sector"],
        "language": gemini["language"] == groq["language"],
        "website": gemini["website_norm"] == groq["website_norm"],
    }

    semantic = {
        field: semantic_score(gemini[field], groq[field])
        for field in _SEMANTIC_FIELDS
    }

    mismatches = [f for f, ok in exact.items() if not ok]
    return {
        "exact": exact,
        "semantic": semantic,
        "mismatches": mismatches,
        "all_exact": not mismatches,
    }


def _categorize_failure(field: str, gemini: dict, groq: dict, org: dict) -> str:
    """Best-effort cause label for a mismatch (for pattern analysis)."""
    g_sse = gemini.get("sse_rating")
    q_sse = groq.get("sse_rating")
    g_type = gemini.get("type")
    q_type = groq.get("type")

    if field == "is_sse":
        if bool(groq["is_sse"]) and not bool(gemini["is_sse"]):
            if q_type in ("nonprofit", "cooperative", "union") and g_type in (
                "government",
                "other",
                None,
            ):
                return "treated_eligible_type_as_sse_without_matching_gemini_gate"
            if g_type == "other" or g_sse == "no":
                return "false_positive_sse_possibly_csr_or_mission_only"
            return "false_positive_sse"
        if not bool(groq["is_sse"]) and bool(gemini["is_sse"]):
            if q_type in ("government", "other") and g_type in (
                "nonprofit",
                "cooperative",
                "union",
            ):
                return "missed_sse_org_type_mismatch"
            return "false_negative_sse"
        return "is_sse_mismatch"

    if field == "sector":
        if groq["sector"] is None and gemini["sector"]:
            return "sector_null_insufficient_evidence_or_ignored_taxonomy"
        if groq["sector"] and gemini["sector"] is None:
            return "sector_invented_or_overconfident"
        return "sector_different_taxonomy_choice"

    if field == "language":
        if groq["language"] is None:
            return "language_null_ignored_website_evidence"
        if gemini["language"] == "bilingual" or groq["language"] == "bilingual":
            return "bilingual_confusion"
        return "language_name_or_signal_mismatch"

    if field == "website":
        if groq["website_norm"] is None and gemini["website_norm"]:
            return "website_null_no_grounding"
        if groq["website_norm"] and gemini["website_norm"] is None:
            return "website_hallucinated_or_discovered"
        return "website_domain_mismatch"

    return "unknown"


def load_prior_mismatch_ids(path: Path) -> list[int]:
    data = json.loads(path.read_text(encoding="utf-8"))
    ids: list[int] = []
    for row in data.get("results") or []:
        if row.get("comparison", {}).get("mismatches"):
            ids.append(int(row["org_id"]))
    return ids


def fetch_orgs_by_ids(ids: list[int]) -> list[dict]:
    if not ids:
        return []
    resp = (
        supabase.table("organizations")
        .select(_SELECT)
        .in_("id", ids)
        .execute()
    )
    by_id = {r["id"]: r for r in (resp.data or [])}
    return [by_id[i] for i in ids if i in by_id]


def fetch_benchmark_orgs(*, limit: int, after_id: int = 0) -> list[dict]:
    """Prioritize ambiguous SSE / sector / language / bilingual candidates.

    Pull a larger pool of Gemini-assessed orgs, then rank for benchmark value.
    """
    pool_size = max(limit * 8, 100)
    resp = (
        supabase.table("organizations")
        .select(_SELECT)
        .not_.is_("sse_rating", "null")
        .gt("id", after_id)
        .order("id")
        .limit(pool_size)
        .execute()
    )
    rows = resp.data or []

    def score(org: dict) -> tuple:
        details = org.get("sse_details") if isinstance(org.get("sse_details"), dict) else {}
        flags = details.get("flags") if isinstance(details.get("flags"), list) else []
        lang = (org.get("language") or "").lower()
        website = org.get("website") or ""
        rating = org.get("sse_rating") or ""
        sector = org.get("sector_id")
        ambiguous = 0
        # Prefer ambiguous SSE
        if rating == "weak_yes":
            ambiguous += 5
        if rating == "strong_yes":
            ambiguous += 1
        # Sector ambiguity
        if sector is None:
            ambiguous += 3
        # Language ambiguity
        if lang in ("", "null") or org.get("language") is None:
            ambiguous += 4
        if lang == "bilingual":
            ambiguous += 4
        # Website locale hints
        if re.search(r"/(en|fr)(?:/|$)|lang=|locale=", website, re.I):
            ambiguous += 3
        if any(isinstance(f, str) and "bilingual" in f.lower() for f in flags):
            ambiguous += 2
        # Prefer orgs with enough Gemini text to compare semantically
        if org.get("mission_statement") or org.get("description"):
            ambiguous += 1
        return (-ambiguous, org["id"])

    ranked = sorted(rows, key=score)
    return ranked[:limit]


def _pct(numer: int, denom: int) -> float:
    if denom <= 0:
        return 0.0
    return round(100.0 * numer / denom, 1)


def summarize(results: list[dict]) -> dict[str, Any]:
    n = len(results)
    exact_counts = {f: 0 for f in _EXACT_FIELDS}
    semantic_sums = {f: 0 for f in _SEMANTIC_FIELDS}
    cause_counts: Counter[str] = Counter()
    mismatch_orgs = 0

    for row in results:
        cmp = row["comparison"]
        for f in _EXACT_FIELDS:
            if cmp["exact"].get(f):
                exact_counts[f] += 1
        for f in _SEMANTIC_FIELDS:
            semantic_sums[f] += cmp["semantic"].get(f, 0)
        if cmp["mismatches"]:
            mismatch_orgs += 1
        for cause in row.get("failure_causes") or []:
            cause_counts[cause] += 1

    return {
        "total": n,
        "orgs_with_any_exact_mismatch": mismatch_orgs,
        "exact_accuracy": {
            f: {
                "matches": exact_counts[f],
                "mismatches": n - exact_counts[f],
                "accuracy_pct": _pct(exact_counts[f], n),
            }
            for f in _EXACT_FIELDS
        },
        "semantic_avg": {
            f: round(semantic_sums[f] / n, 3) if n else 0.0
            for f in _SEMANTIC_FIELDS
        },
        "semantic_pct_of_max": {
            f: _pct(semantic_sums[f], n * 2) if n else 0.0
            for f in _SEMANTIC_FIELDS
        },
        "failure_causes": dict(cause_counts.most_common()),
    }


def run(
    *,
    limit: int,
    delay_seconds: float,
    prompt_version: str,
    prior_results: Path | None,
    after_id: int,
    out_dir: Path,
    fetch_web: bool,
    prefer_small: bool,
    inject_website_evidence: bool,
) -> dict[str, Any]:
    _install_prompt_addendum(prompt_version)
    assessor = _groq_only_assessor(prefer_small=prefer_small)
    logger.info(
        "Prompt version=%s model=%s evidence_inject=%s — Groq-only "
        "OrganizationAssessor (no writes)",
        prompt_version,
        getattr(assessor.provider, "_model", "?"),
        inject_website_evidence,
    )

    if prior_results and prior_results.exists():
        ids = load_prior_mismatch_ids(prior_results)[:limit]
        orgs = fetch_orgs_by_ids(ids)
        logger.info("Loaded %d prior-mismatch orgs from %s", len(orgs), prior_results)
        # Fill remaining slots from ranked pool
        if len(orgs) < limit:
            extra = fetch_benchmark_orgs(limit=limit - len(orgs), after_id=after_id)
            seen = {o["id"] for o in orgs}
            for o in extra:
                if o["id"] not in seen:
                    orgs.append(o)
                    seen.add(o["id"])
                if len(orgs) >= limit:
                    break
    else:
        orgs = fetch_benchmark_orgs(limit=limit, after_id=after_id)
        logger.info("Selected %d benchmark orgs (ambiguous-first)", len(orgs))

    results: list[dict] = []
    errors = 0

    for i, org in enumerate(orgs, 1):
        org_id = org["id"]
        name = org.get("name")
        logger.info("[%d/%d] Groq assess org_id=%s (%s)", i, len(orgs), org_id, name)
        gemini = _gemini_snapshot(org)

        try:
            updates = _assess_groq_only(
                assessor,
                org,
                fetch_web=fetch_web,
                inject_website_evidence=inject_website_evidence,
            )
        except Exception as exc:
            logger.warning("Assessor error for org_id=%s: %s", org_id, exc)
            errors += 1
            results.append(
                {
                    "org_id": org_id,
                    "name": name,
                    "error": str(exc),
                    "gemini": gemini,
                    "groq": None,
                    "comparison": {
                        "exact": {f: False for f in _EXACT_FIELDS},
                        "semantic": {f: 0 for f in _SEMANTIC_FIELDS},
                        "mismatches": list(_EXACT_FIELDS),
                        "all_exact": False,
                    },
                    "failure_causes": ["assessor_error"],
                }
            )
            continue

        if updates is None:
            logger.warning("Assessor returned None for org_id=%s", org_id)
            errors += 1
            results.append(
                {
                    "org_id": org_id,
                    "name": name,
                    "error": "assessor_returned_none",
                    "gemini": gemini,
                    "groq": None,
                    "comparison": {
                        "exact": {f: False for f in _EXACT_FIELDS},
                        "semantic": {f: 0 for f in _SEMANTIC_FIELDS},
                        "mismatches": list(_EXACT_FIELDS),
                        "all_exact": False,
                    },
                    "failure_causes": ["assessor_returned_none"],
                }
            )
            continue

        groq = _groq_snapshot(updates)
        comparison = compare_pair(gemini, groq)
        causes = [
            _categorize_failure(field, gemini, groq, org)
            for field in comparison["mismatches"]
        ]

        row = {
            "org_id": org_id,
            "name": name,
            "gemini": gemini,
            "groq": groq,
            "comparison": comparison,
            "failure_causes": causes,
        }
        results.append(row)

        mismatch_str = (
            ",".join(comparison["mismatches"]) if comparison["mismatches"] else "none"
        )
        logger.info(
            "  exact mismatches=[%s] semantic=%s sse gemini=%s groq=%s",
            mismatch_str,
            comparison["semantic"],
            gemini.get("sse_rating"),
            groq.get("sse_rating"),
        )

        if delay_seconds > 0 and i < len(orgs):
            time.sleep(delay_seconds)

    summary = summarize(results)
    payload = {
        "prompt_version": prompt_version,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "limit": limit,
        "errors": errors,
        "dry_run": True,
        "wrote_to_supabase": False,
        "called_gemini": False,
        "summary": summary,
        "results": results,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{prompt_version}.json"
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("Wrote results to %s", out_path)

    # Human-readable summary
    print("\n" + "=" * 60)
    print(f"Groq vs Gemini — prompt_version={prompt_version}")
    print(f"Total organizations tested: {summary['total']}")
    print(f"Orgs with any exact-field mismatch: {summary['orgs_with_any_exact_mismatch']}")
    print("-" * 60)
    for f in _EXACT_FIELDS:
        acc = summary["exact_accuracy"][f]
        print(
            f"{f} accuracy: {acc['accuracy_pct']}% "
            f"({acc['matches']}/{summary['total']} exact matches, "
            f"{acc['mismatches']} mismatches)"
        )
    print("-" * 60)
    for f in _SEMANTIC_FIELDS:
        print(
            f"{f} semantic avg: {summary['semantic_avg'][f]} / 2 "
            f"({summary['semantic_pct_of_max'][f]}% of max)"
        )
    if summary["failure_causes"]:
        print("-" * 60)
        print("Top failure causes:")
        for cause, count in list(summary["failure_causes"].items())[:12]:
            print(f"  {count:3d}  {cause}")
    print("=" * 60)
    print(f"Full JSON: {out_path}")

    return payload


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compare Groq org assessment to stored Gemini results (dry-run)."
    )
    parser.add_argument("--prod", action="store_true", help="Read from production Supabase")
    parser.add_argument("--limit", type=int, default=25, help="Number of orgs to test")
    parser.add_argument("--after-id", type=int, default=0, help="Start after this org id")
    parser.add_argument(
        "--delay",
        type=float,
        default=6.0,
        help="Seconds between Groq calls (default 6 for free-tier TPM)",
    )
    parser.add_argument(
        "--prompt-version",
        default="v0-baseline",
        help="Label for this run (stored in output JSON / changelog)",
    )
    parser.add_argument(
        "--prior-results",
        type=Path,
        default=None,
        help="Prior comparison JSON — prioritize orgs that mismatched",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "groq_org_eval",
        help="Directory for result JSON files",
    )
    parser.add_argument(
        "--fetch-web",
        action="store_true",
        help="Allow language classifier to fetch websites (slower, closer to backfill)",
    )
    parser.add_argument(
        "--prefer-small",
        action="store_true",
        help="Start on llama-3.1-8b-instant (higher RPD when 70b daily quota is exhausted)",
    )
    parser.add_argument(
        "--inject-website-evidence",
        action="store_true",
        help="Fetch Known website HTML text into the prompt (ungrounded Groq evidence)",
    )
    args = parser.parse_args()

    run(
        limit=args.limit,
        delay_seconds=args.delay,
        prompt_version=args.prompt_version,
        prior_results=args.prior_results,
        after_id=args.after_id,
        out_dir=args.out_dir,
        fetch_web=args.fetch_web,
        prefer_small=args.prefer_small,
        inject_website_evidence=args.inject_website_evidence,
    )


if __name__ == "__main__":
    main()
