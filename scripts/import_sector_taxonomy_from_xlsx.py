#!/usr/bin/env python3
"""Regenerate shared/taxonomy/sectors.json from the MASTER crosswalk workbook.

Usage:
  python3 scripts/import_sector_taxonomy_from_xlsx.py \
    [path/to/SSE_sector_taxonomy_crosswalk_MASTER.xlsx]
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

from openpyxl import load_workbook

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


def parse_scope(scope: str):
    inclusions, exclusions, usage = [], [], None
    if not scope:
        return inclusions, exclusions, usage
    m = re.search(r"Inclusions:\s*(.+?)(?:\.\s*Exclusions:|$)", scope, re.I | re.S)
    if m:
        inclusions = [p.strip(" .") for p in re.split(r",|;", m.group(1)) if p.strip(" .")]
    m = re.search(r"Exclusions:\s*(.+)$", scope, re.I | re.S)
    if m:
        exclusions = [p.strip(" .") for p in re.split(r",|;", m.group(1)) if p.strip(" .")]
    m = re.search(r"Usage:\s*(.+)$", scope, re.I | re.S)
    if m:
        usage = m.group(1).strip()
    return inclusions, exclusions, usage


def extract_aliases(raw: str, label_en: str, label_fr: str) -> list[str]:
    aliases = {label_en, label_fr}
    if not raw:
        return sorted(aliases)
    text = str(raw).strip()
    text2 = re.sub(r"^[^:]+:\s*", "", text)
    text2 = re.sub(r"\s+(jobs|tags)$", "", text2, flags=re.I).strip()
    text3 = re.sub(
        r"^(CQCM|Chantier|CMC|CCEDNet|RIPESS|SolidarityNYC|UNTFSSE|ICA|SEUK|USFWC|NEC|CSMO-ESAC|StatsQc|BuySocial|SolidarityEconomy|ImagineCanada|EspaceOBNL|StatistiqueQc|ISIC Rev 4 Code for|TorontoBetter)\s+",
        "",
        text2,
        flags=re.I,
    ).strip()
    for candidate in (text2, text3):
        if candidate:
            aliases.add(candidate)
    return sorted(aliases, key=lambda s: (len(s), s.lower()))


def main() -> int:
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    wb = load_workbook(xlsx, data_only=True)
    ws = wb["Final Crosswalk (Full)"]
    headers = [ws.cell(4, c).value for c in range(1, 56)]
    sources = []
    for c, h in enumerate(headers[11:], 12):
        kind = "sse_core"
        if "(Reference)" in h:
            kind = "reference"
        elif "(Scraped" in h:
            kind = "scraped"
        elif "(Candidate)" in h:
            kind = "candidate"
        sources.append(
            {
                "key": source_key(h),
                "label": re.sub(
                    r"\s*\((SSE Core|Reference|Scraped.*?|Candidate)\)\s*$", "", h
                ).strip(),
                "kind": kind,
                "column": c,
            }
        )

    sectors, facets = [], []
    for r in range(5, 25):
        cat_id = ws.cell(r, 1).value
        label_en = ws.cell(r, 2).value
        label_fr = ws.cell(r, 3).value
        definition = ws.cell(r, 4).value or ""
        scope = ws.cell(r, 5).value or ""
        inclusions, exclusions, usage = parse_scope(scope)
        kind = "facet" if str(cat_id).startswith("SSE_FAC_") else "sector"
        entry_id = CATEGORY_IDS[cat_id]
        term_crosswalk = {}
        all_aliases: set[str] = set()
        for src in sources:
            raw = ws.cell(r, src["column"]).value
            if raw is None:
                continue
            term_crosswalk[src["key"]] = str(raw)
            all_aliases.update(extract_aliases(str(raw), label_en, label_fr))
        signals_en = []
        for inc in inclusions:
            piece = re.split(r"[/(]", inc)[0].strip()
            if piece and len(piece) < 80:
                signals_en.append(piece)
        entry = {
            "id": entry_id,
            "category_id": cat_id,
            "kind": kind,
            "label_en": label_en,
            "label_fr": label_fr,
            "definition_en": definition,
            "definition_fr": definition,
            "scope_note_en": scope,
            "inclusions": inclusions,
            "exclusions": exclusions,
            "signals_en": signals_en[:12],
            "signals_fr": [],
            "example_en": (f"Example: {'; '.join(inclusions[:3])}." if inclusions else ""),
            "example_fr": f"Exemple : {label_fr}.",
            "boundary_note_en": (
                f"Exclusions: {'; '.join(exclusions)}." if exclusions else (usage or "")
            ),
            "boundary_note_fr": (
                f"Exclusions: {'; '.join(exclusions)}." if exclusions else (usage or "")
            ),
            "skos": {
                "mapping_predicate": ws.cell(r, 6).value,
                "sssom_match_type": ws.cell(r, 7).value,
                "sssom_confidence": (
                    float(ws.cell(r, 8).value) if ws.cell(r, 8).value is not None else None
                ),
                "compound_mapping_rule": ws.cell(r, 9).value,
            },
            "aliases": sorted(all_aliases, key=lambda s: (len(s), s.lower())),
            "term_crosswalk": term_crosswalk,
        }
        if kind == "facet":
            entry["usage"] = usage
            facets.append(entry)
        else:
            sectors.append(entry)

    rules_ws = wb["Logic & Decision Rules"]
    decision_rules = []
    for r in range(4, 11):
        rid = rules_ws.cell(r, 1).value
        if not rid:
            continue
        decision_rules.append(
            {
                "id": rid,
                "target": rules_ws.cell(r, 2).value,
                "issue": rules_ws.cell(r, 3).value,
                "rule": rules_ws.cell(r, 4).value,
                "reference": rules_ws.cell(r, 5).value,
            }
        )

    sssom_ws = wb["SSSOM Mapping Set (Export)"]
    sssom_headers = [sssom_ws.cell(3, c).value for c in range(1, 10)]
    sssom = []
    for r in range(4, 24):
        row = {sssom_headers[c - 1]: sssom_ws.cell(r, c).value for c in range(1, 10)}
        if row.get("subject_id"):
            if row.get("confidence") is not None:
                row["confidence"] = float(row["confidence"])
            sssom.append(row)

    out = {
        "version": "2.5",
        "description": (
            "Unified SSE Sector Taxonomy Crosswalk v2.5 (FAIR & SKOS). "
            "17 industry sectors + 3 non-sector facets (role, population/cause, employer type). "
            "Imported from SSE sector taxonomy crosswalk MASTER.xlsx."
        ),
        "source_workbook": "shared/taxonomy/SSE_sector_taxonomy_crosswalk_MASTER.xlsx",
        "crosswalk_sources": {
            s["key"]: {"label": s["label"], "kind": s["kind"]} for s in sources
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
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_JSON} ({len(sectors)} sectors, {len(facets)} facets)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
