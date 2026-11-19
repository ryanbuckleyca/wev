#!/usr/bin/env python3
"""Regenerate shared/taxonomy/sectors.json from the MASTER crosswalk workbook.

Usage:
  # openpyxl is in wev-scraper/requirements-dev.txt
  pip install openpyxl
  python3 scripts/import_sector_taxonomy_from_xlsx.py \
    [path/to/SSE_sector_taxonomy_crosswalk_MASTER.xlsx]
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

from openpyxl import load_workbook  # pyright: ignore[reportMissingModuleSource]

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XLSX = ROOT / "shared" / "taxonomy" / "SSE_sector_taxonomy_crosswalk_MASTER.xlsx"
OUT_JSON = ROOT / "shared" / "taxonomy" / "sectors.json"

CATEGORY_IDS = {
    "SSE_SEC_01": "social-health-care-services",
    "SSE_SEC_02": "education-knowledge",
    "SSE_SEC_03": "employment-workforce-integration",
    "SSE_SEC_04": "housing-collective-real-estate",
    "SSE_SEC_05": "arts-culture-media",
    "SSE_SEC_06": "recreation-tourism-hospitality",
    "SSE_SEC_07": "agriculture-food-systems",
    "SSE_SEC_08": "environment-circular-economy",
    "SSE_SEC_09": "financial-insurance-services",
    "SSE_SEC_10": "retail-consumer-goods",
    "SSE_SEC_11": "production-construction-transportation",
    "SSE_SEC_12": "technology-digital-infrastructure",
    "SSE_SEC_13": "business-professional-services",
    "SSE_SEC_14": "advocacy-rights-representation",
    "SSE_SEC_15": "community-development-philanthropy-volunteering",
    "SSE_SEC_16": "international-cooperation-development",
    "SSE_SEC_17": "other-nec",
    "SSE_FAC_18": "facet-role-function",
    "SSE_FAC_19": "facet-population-cause-geography",
    "SSE_FAC_20": "facet-employer-type",
}


def cell_value(ws: Any, row: int, col: int) -> Any:
    return ws.cell(row, col).value


def cell_str(ws: Any, row: int, col: int) -> str:
    value = cell_value(ws, row, col)
    if value is None:
        return ""
    return str(value)


def cell_float(ws: Any, row: int, col: int) -> float | None:
    value = cell_value(ws, row, col)
    if value is None:
        return None
    return float(value)


def source_key(header: str) -> str:
    h = re.sub(r"\s*\((SSE Core|Reference|Scraped.*?|Candidate)\)\s*$", "", header)
    replacements = {
        "Chantier de l'économie sociale": "chantier",
        "CMC / Canada Coops": "cmc",
        "Buy Social Canada": "buy_social_canada",
        "ILO / ISIC": "ilo_isic",
        "UNTFSSE / Social Economy Europe": "untfsse",
        "New Economy Coalition": "nec",
        "CSMO-ESAC Quebec survey": "csmo_esac",
        "Statistics Québec groups": "stats_quebec_groups",
        "Statistique Quebec": "statistique_quebec",
        "SolidarityEconomy.us": "solidarity_economy_us",
        "Toronto the Better": "toronto_the_better",
        "Charity Village": "charityvillage",
        "Work In Culture": "workinculture",
        "WorkInNonProfits": "workinnonprofits",
        "Ma Communauté": "macommunaute",
        "Eco Canada": "ecocanada",
        "Emplois Sociaux": "emplois_sociaux",
        "Reach Hire": "reach_hire",
        "Work Cabin": "work_cabin",
        "Climate Designers": "climate_designers",
        "Espace OBNL": "espace_obnl",
        "Imagine Canada": "imagine_canada",
        "SolidarityNYC": "solidarity_nyc",
        "CQCM": "cqcm",
        "CCEDNet": "ccednet",
        "RIPESS": "ripess",
        "ICA": "ica",
        "SEUK": "seuk",
        "USFWC": "usfwc",
        "Idealist": "idealist",
        "EcoWorks": "ecoworks",
        "GoodWork": "goodwork",
        "Centraide": "centraide",
        "CSI": "csi",
        "COCo": "coco",
        "CWCF": "cwcf",
        "ECVO": "ecvo",
        "ConnectJobs": "connectjobs",
        "Engagés": "engages",
        "ImpactPool": "impactpool",
        "Bmeaningful": "bmeaningful",
        "Environemplois": "environemplois",
        "Devex": "devex",
        "FoodWork": "foodwork",
    }
    for old, new in replacements.items():
        if h.strip() == old or h.startswith(old):
            return new
    text = unicodedata.normalize("NFKD", h)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def parse_scope(scope: str) -> tuple[list[str], list[str], str | None]:
    inclusions: list[str] = []
    exclusions: list[str] = []
    usage: str | None = None
    if not scope:
        return inclusions, exclusions, usage
    match = re.search(r"Inclusions:\s*(.+?)(?:\.\s*Exclusions:|$)", scope, re.I | re.S)
    if match:
        inclusions = [
            part.strip(" .") for part in re.split(r",|;", match.group(1)) if part.strip(" .")
        ]
    match = re.search(r"Exclusions:\s*(.+)$", scope, re.I | re.S)
    if match:
        exclusions = [
            part.strip(" .") for part in re.split(r",|;", match.group(1)) if part.strip(" .")
        ]
    match = re.search(r"Usage:\s*(.+)$", scope, re.I | re.S)
    if match:
        usage = match.group(1).strip()
    return inclusions, exclusions, usage


def parse_definition_examples(definition: str) -> list[str]:
    """Pull documented e.g. facet values (Accounting, Youth, Non-Profit, …)."""
    match = re.search(r"\be\.g\.,?\s*(.+?)\)", definition, re.I | re.S)
    if not match:
        return []
    return [
        part.strip(" .")
        for part in re.split(r",|;", match.group(1))
        if part.strip(" .") and len(part.strip(" .")) < 80
    ]


def validate_category_ids(seen_codes: list[str]) -> None:
    """Require every MASTER CATEGORY_IDS code exactly once before writing JSON."""
    counts: dict[str, int] = {}
    for code in seen_codes:
        counts[code] = counts.get(code, 0) + 1

    expected = set(CATEGORY_IDS)
    observed = set(counts)
    missing = sorted(expected - observed)
    unexpected = sorted(observed - expected)
    duplicates = sorted(code for code, n in counts.items() if n > 1)

    problems: list[str] = []
    if missing:
        problems.append(f"missing: {', '.join(missing)}")
    if unexpected:
        problems.append(f"unexpected: {', '.join(unexpected)}")
    if duplicates:
        problems.append(f"duplicate: {', '.join(duplicates)}")
    if problems:
        raise SystemExit(
            "CATEGORY_IDS validation failed — refusing to write sectors.json ("
            + "; ".join(problems)
            + ")"
        )


def validate_source_keys(sources: list[dict[str, Any]]) -> None:
    """Reject empty or duplicate source_key values before importing category rows."""
    seen: dict[str, int] = {}
    for src in sources:
        key = str(src.get("key") or "").strip()
        col = int(src["column"])
        if not key:
            raise SystemExit(
                f"source_key validation failed — empty key at column {col}; "
                "refusing to write sectors.json"
            )
        if key in seen:
            raise SystemExit(
                f"source_key validation failed — duplicate key {key!r} at columns "
                f"{seen[key]} and {col}; refusing to write sectors.json"
            )
        seen[key] = col
        src["key"] = key


def write_sectors_json(payload: dict[str, Any]) -> None:
    """Atomically replace sectors.json after a successful temp write."""
    import os
    import tempfile

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    tmp_fd, tmp_path_str = tempfile.mkstemp(
        suffix=".tmp",
        prefix=f".{OUT_JSON.name}.",
        dir=OUT_JSON.parent,
        text=True,
    )
    tmp_path = Path(tmp_path_str)
    try:
        with os.fdopen(tmp_fd, 'w', encoding='utf-8') as f:
            f.write(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
        tmp_path.replace(OUT_JSON)
    except Exception:
        if tmp_path.exists():
            tmp_path.unlink()
        raise


def main() -> int:
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    workbook = load_workbook(xlsx, data_only=True)
    worksheet = workbook["Final Crosswalk (Full)"]
    headers = [cell_str(worksheet, 4, col) for col in range(1, 56)]
    sources: list[dict[str, Any]] = []
    for col, header in enumerate(headers[11:], 12):
        kind = "sse_core"
        if "(Reference)" in header:
            kind = "reference"
        elif "(Scraped" in header:
            kind = "scraped"
        elif "(Candidate)" in header:
            kind = "candidate"
        sources.append(
            {
                "key": source_key(header),
                "label": re.sub(
                    r"\s*\((SSE Core|Reference|Scraped.*?|Candidate)\)\s*$",
                    "",
                    header,
                ).strip(),
                "kind": kind,
                "column": col,
            }
        )

    validate_source_keys(sources)

    seen_category_codes: list[str] = []
    sectors: list[dict[str, Any]] = []
    facets: list[dict[str, Any]] = []
    for row in range(5, 25):
        cat_id = cell_str(worksheet, row, 1)
        if not cat_id:
            continue
        seen_category_codes.append(cat_id)
        label_en = cell_str(worksheet, row, 2)
        label_fr = cell_str(worksheet, row, 3)
        definition = cell_str(worksheet, row, 4)
        scope = cell_str(worksheet, row, 5)
        inclusions, exclusions, usage = parse_scope(scope)
        kind = "facet" if cat_id.startswith("SSE_FAC_") else "sector"
        if cat_id not in CATEGORY_IDS:
            # Collected for validate_category_ids; skip building an entry.
            continue
        entry_id = CATEGORY_IDS[cat_id]
        term_crosswalk: dict[str, str] = {}
        for src in sources:
            raw = cell_str(worksheet, row, int(src["column"]))
            if not raw:
                continue
            term_crosswalk[str(src["key"])] = raw
        # Preferred labels only as global aliases. Source-board terms stay in
        # term_crosswalk so reverse-lookup keeps source ownership (e.g. CMC).
        # Facet definitions document searchable example values (Accounting,
        # Youth, Non-Profit); keep those as global aliases beside umbrella labels.
        example_terms = parse_definition_examples(definition) if kind == "facet" else []
        all_aliases = {label_en, label_fr, *example_terms}
        signals_en: list[str] = []
        for inclusion in inclusions:
            piece = re.split(r"[/(]", inclusion)[0].strip()
            if piece and len(piece) < 80:
                signals_en.append(piece)
        if kind == "facet" and example_terms:
            signals_en = list(dict.fromkeys([*example_terms, *signals_en]))
        # MASTER sheet supplies English unified definition/scope only; leave FR
        # definition/boundary/example empty rather than copying English text.
        boundary_en = (
            f"Exclusions: {'; '.join(exclusions)}." if exclusions else (usage or "")
        )
        entry: dict[str, Any] = {
            "id": entry_id,
            "category_id": cat_id,
            "kind": kind,
            "label_en": label_en,
            "label_fr": label_fr,
            "definition_en": definition,
            "definition_fr": "",
            "scope_note_en": scope,
            "inclusions": inclusions,
            "exclusions": exclusions,
            "signals_en": signals_en[:12],
            "signals_fr": [],
            "example_en": (
                f"Example: {'; '.join(inclusions[:3])}."
                if inclusions
                else (f"Example: {'; '.join(example_terms[:3])}." if example_terms else "")
            ),
            "example_fr": "",
            "boundary_note_en": boundary_en,
            "boundary_note_fr": "",
            "skos": {
                "mapping_predicate": cell_str(worksheet, row, 6) or None,
                "sssom_match_type": cell_str(worksheet, row, 7) or None,
                "sssom_confidence": cell_float(worksheet, row, 8),
                "compound_mapping_rule": cell_str(worksheet, row, 9) or None,
            },
            "aliases": sorted(
                (a for a in all_aliases if a),
                key=lambda s: (len(s), s.lower()),
            ),
            "term_crosswalk": term_crosswalk,
        }
        if kind == "facet":
            entry["usage"] = usage
            facets.append(entry)
        else:
            sectors.append(entry)

    validate_category_ids(seen_category_codes)

    # Sort sectors by category_id for stable output order
    sectors.sort(key=lambda s: s["category_id"])

    rules_ws = workbook["Logic & Decision Rules"]
    decision_rules: list[dict[str, Any]] = []
    for row in range(4, 11):
        rule_id = cell_str(rules_ws, row, 1)
        if not rule_id:
            continue
        decision_rules.append(
            {
                "id": rule_id,
                "target": cell_str(rules_ws, row, 2),
                "issue": cell_str(rules_ws, row, 3),
                "rule": cell_str(rules_ws, row, 4),
                "reference": cell_str(rules_ws, row, 5),
            }
        )

    sssom_ws = workbook["SSSOM Mapping Set (Export)"]
    sssom_headers = [cell_str(sssom_ws, 3, col) for col in range(1, 10)]

    # Validate required SSSOM headers before processing mapping rows
    required_sssom_headers = [
        "subject_id",
        "subject_label",
        "predicate_id",
        "object_id",
        "object_label",
        "match_type",
        "confidence",
    ]
    missing_headers = [h for h in required_sssom_headers if h not in sssom_headers]
    if missing_headers:
        print(
            f"ERROR: SSSOM sheet missing required headers: {', '.join(missing_headers)}",
            file=sys.stderr,
        )
        print(f"Found headers: {sssom_headers}", file=sys.stderr)
        raise SystemExit(1)

    # Check for duplicate headers (e.g., two subject_id columns)
    seen_headers: dict[str, int] = {}
    for i, header in enumerate(sssom_headers, start=1):
        if header in seen_headers:
            print(
                f"ERROR: SSSOM sheet has duplicate header '{header}' at columns {seen_headers[header]} and {i}",
                file=sys.stderr,
            )
            raise SystemExit(1)
        seen_headers[header] = i

    sssom: list[dict[str, Any]] = []
    # Read SSSOM mappings until we hit a blank subject_id (dynamic boundary)
    row = 4
    while row <= 100:  # Safety limit to prevent infinite loop
        record = {
            sssom_headers[col - 1]: cell_value(sssom_ws, row, col) for col in range(1, 10)
        }
        subject_id = record.get("subject_id")
        if not subject_id:
            # Blank row - stop reading
            break
        confidence = record.get("confidence")
        if confidence is not None:
            record["confidence"] = float(confidence)
        sssom.append(record)
        row += 1

    # Verify all expected subjects were read (17 sectors + 3 facets = 20)
    expected_subjects = set(CATEGORY_IDS.keys())
    found_subjects = {str(r.get("subject_id", "")).split(":")[-1] for r in sssom}
    missing_subjects = expected_subjects - found_subjects
    if missing_subjects:
        print(
            f"ERROR: SSSOM sheet missing mappings for: {', '.join(sorted(missing_subjects))}",
            file=sys.stderr,
        )
        print(f"Found {len(found_subjects)} mappings, expected {len(expected_subjects)}", file=sys.stderr)
        raise SystemExit(1)

    out = {
        "version": "2.5",
        "description": (
            "Unified SSE Sector Taxonomy Crosswalk v2.5 (FAIR & SKOS). "
            "17 industry sectors + 3 non-sector facets "
            "(role, population/cause, employer type). "
            "Imported from SSE sector taxonomy crosswalk MASTER.xlsx."
        ),
        "source_workbook": "shared/taxonomy/SSE_sector_taxonomy_crosswalk_MASTER.xlsx",
        "crosswalk_sources": {
            str(src["key"]): {"label": src["label"], "kind": src["kind"]} for src in sources
        },
        "legacy_id_map": {
            "care-health-social-services": "social-health-care-services",
            "arts-culture-information": "arts-culture-media",
            "manufacturing-production": "production-construction-transportation",
            "community-civic-infrastructure": "community-development-philanthropy-volunteering",
            "agriculture-food-systems": "agriculture-food-systems",
            "education-knowledge": "education-knowledge",
            "environment-circular-economy": "environment-circular-economy",
            "financial-insurance-services": "financial-insurance-services",
            "housing-collective-real-estate": "housing-collective-real-estate",
            "retail-consumer-goods": "retail-consumer-goods",
            "technology-digital-infrastructure": "technology-digital-infrastructure",
        },
        "decision_rules": decision_rules,
        "sssom_mappings": sssom,
        "sectors": sectors,
        "facets": facets,
    }
    write_sectors_json(out)
    print(f"Wrote {OUT_JSON} ({len(sectors)} sectors, {len(facets)} facets)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
