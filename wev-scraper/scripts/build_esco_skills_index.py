#!/usr/bin/env python3
"""Build a bilingual ESCO skills index from the ESCO public API.

Outputs:
1) Compact JSON index with EN/FR localized fields and richer metadata.
2) Optional upsert to Supabase table `public.esco_skills`.

Source:
- https://ec.europa.eu/esco/api/search?type=skill&language=en&full=true
- https://ec.europa.eu/esco/api/search?type=skill&language=fr&full=true
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import find_dotenv, load_dotenv

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
load_dotenv(find_dotenv())

DEFAULT_JSON_OUT = PROJECT_ROOT / "supabase" / "seed" / "esco_skills_index.json"
ESCO_SEARCH_URL = "https://ec.europa.eu/esco/api/search"
SUPPORTED_LANGUAGES = ("en", "fr")
RETRYABLE_HTTP_CODES = {429, 500, 502, 503, 504}
REQUEST_TIMEOUT_SECONDS = 20


def _clean_text(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.replace("\u00a0", " ").split()).strip()


def _ci_sort(values: Iterable[str]) -> list[str]:
    return sorted(values, key=lambda v: (v.casefold(), v))


def _extract_uri_tail(uri: str | None) -> str:
    raw = _clean_text(uri)
    if not raw:
        return ""
    return raw.rstrip("/").split("/")[-1]


def _extract_localized_text(value: object, language: str) -> str:
    def _to_text(item: object) -> str:
        if isinstance(item, str):
            return _clean_text(item)
        if isinstance(item, dict):
            literal = item.get("literal")
            if isinstance(literal, str):
                return _clean_text(literal)
        return ""

    if isinstance(value, dict):
        if language == "en":
            raw = value.get("en") or value.get("en-us")
        else:
            raw = value.get(language)
        if isinstance(raw, (str, dict)):
            return _to_text(raw)
        if isinstance(raw, list):
            joined = ", ".join(
                text
                for text in (_to_text(v) for v in raw)
                if text
            )
            return _clean_text(joined)
        return ""

    if isinstance(value, (str, dict)):
        return _to_text(value)

    return ""


def _extract_localized_list(value: object, language: str) -> list[str]:
    def _to_text(item: object) -> str:
        if isinstance(item, str):
            return _clean_text(item)
        if isinstance(item, dict):
            literal = item.get("literal")
            if isinstance(literal, str):
                return _clean_text(literal)
        return ""

    raw: object | None
    if isinstance(value, dict):
        if language == "en":
            raw = value.get("en") or value.get("en-us")
        else:
            raw = value.get(language)
    else:
        raw = value

    if isinstance(raw, (str, dict)):
        clean = _to_text(raw)
        return [clean] if clean else []

    if isinstance(raw, list):
        out: list[str] = []
        for item in raw:
            clean = _to_text(item)
            if clean:
                out.append(clean)
        return out

    return []


@dataclass
class EscoRequestError(RuntimeError):
    code: int | None
    url: str
    detail: str

    def __str__(self) -> str:
        code = self.code if self.code is not None else "network"
        return f"ESCO request failed ({code}) for {self.url}: {self.detail[:600]}"


def _request_json(url: str, retries: int = 1) -> dict:
    req = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "wev-bulletin-esco-index/1.0",
        },
        method="GET",
    )

    attempt = 0
    while True:
        try:
            with urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:  # nosec B310
                body = resp.read()
            break
        except HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")
            if e.code in RETRYABLE_HTTP_CODES and attempt < retries:
                attempt += 1
                time.sleep(0.75 * attempt)
                continue
            raise EscoRequestError(code=e.code, url=url, detail=detail or str(e)) from e
        except URLError as e:
            if attempt < retries:
                attempt += 1
                time.sleep(0.75 * attempt)
                continue
            raise EscoRequestError(code=None, url=url, detail=str(e)) from e
        except TimeoutError as e:
            if attempt < retries:
                attempt += 1
                time.sleep(0.75 * attempt)
                continue
            raise EscoRequestError(code=None, url=url, detail=str(e)) from e

    try:
        payload = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Invalid ESCO JSON payload from {url}: {e}") from e

    if not isinstance(payload, dict):
        raise RuntimeError(f"Unexpected ESCO payload type from {url}: {type(payload)}")
    return payload


def _build_search_url(language: str, page: int, limit: int, full: bool = True) -> str:
    query = urlencode(
        {
            "type": "skill",
            "language": language,
            "full": "true" if full else "false",
            "viewObsolete": "false",
            "limit": str(limit),
            "offset": str(page),
        }
    )
    return f"{ESCO_SEARCH_URL}?{query}"


def _build_resource_url(language: str, uri: str) -> str:
    query = urlencode(
        {
            "uri": uri,
            "language": language,
        }
    )
    return f"https://ec.europa.eu/esco/api/resource/skill?{query}"


def _extract_results(payload: dict) -> list[dict]:
    embedded = payload.get("_embedded")
    if not isinstance(embedded, dict):
        return []
    results = embedded.get("results")
    if not isinstance(results, list):
        return []
    return [r for r in results if isinstance(r, dict)]


def _row_range_for_page(page: int, limit: int, total: int) -> range:
    start = page * limit
    end = min(start + limit, total)
    return range(start, end)


def _merge_skill_metadata(row: dict, metadata_row: dict | None) -> dict:
    if not metadata_row:
        return row

    current_skill_type = row.get("hasSkillType")
    if (
        (not isinstance(current_skill_type, list) or not current_skill_type)
        and isinstance(metadata_row.get("hasSkillType"), list)
        and metadata_row.get("hasSkillType")
    ):
        row["hasSkillType"] = metadata_row["hasSkillType"]

    current_reuse_level = row.get("hasReuseLevel")
    if (
        (not isinstance(current_reuse_level, list) or not current_reuse_level)
        and isinstance(metadata_row.get("hasReuseLevel"), list)
        and metadata_row.get("hasReuseLevel")
    ):
        row["hasReuseLevel"] = metadata_row["hasReuseLevel"]

    return row


def _recover_row(language: str, row_index: int) -> tuple[dict | None, str]:
    # Fast-path retry with full payload for a single row.
    try:
        payload = _request_json(_build_search_url(language=language, page=row_index, limit=1, full=True))
        results = _extract_results(payload)
        if results:
            return results[0], "single_full"
    except EscoRequestError:
        pass

    # Fallback to basic search row.
    try:
        payload = _request_json(_build_search_url(language=language, page=row_index, limit=1, full=False))
    except EscoRequestError:
        return None, "failed"

    basic_rows = _extract_results(payload)
    if not basic_rows:
        return None, "missing"
    basic = basic_rows[0]

    uri = _clean_text(basic.get("uri"))
    if uri:
        # Try full resource lookup for richer fields.
        try:
            resource = _request_json(_build_resource_url(language=language, uri=uri))
            if isinstance(resource, dict):
                resource.setdefault("uri", uri)
                if "title" not in resource and isinstance(basic.get("title"), str):
                    resource["title"] = basic["title"]
                if "preferredLabel" not in resource and isinstance(basic.get("preferredLabel"), dict):
                    resource["preferredLabel"] = basic["preferredLabel"]
                return resource, "resource"
        except EscoRequestError:
            pass

    return basic, "basic"


def fetch_skill_pages(language: str, limit: int) -> tuple[list[dict], dict]:
    if language not in SUPPORTED_LANGUAGES:
        raise ValueError(f"Unsupported language: {language}")
    if limit <= 0:
        raise ValueError("--api-limit must be > 0")

    rows: list[dict] = []
    meta_payload = _request_json(_build_search_url(language=language, page=0, limit=limit, full=False))
    total_raw = meta_payload.get("total")
    total = int(total_raw) if isinstance(total_raw, int) else 0
    pages = max(1, math.ceil(total / limit)) if total > 0 else 0

    fallback_pages = 0
    fallback_rows = 0
    recovered_resource = 0
    recovered_basic = 0
    skipped_rows = 0

    for page in range(pages):
        metadata_by_uri: dict[str, dict] = {}
        try:
            metadata_payload = _request_json(
                _build_search_url(language=language, page=page, limit=limit, full=False)
            )
            for meta_row in _extract_results(metadata_payload):
                meta_uri = _clean_text(meta_row.get("uri"))
                if meta_uri:
                    metadata_by_uri[meta_uri] = meta_row
        except EscoRequestError as e:
            print(
                f"Warning: metadata fetch failed for language={language} page={page + 1}/{pages} "
                f"({e.code or 'network'})"
            )

        page_url = _build_search_url(language=language, page=page, limit=limit, full=True)
        try:
            payload = _request_json(page_url)
            page_rows = _extract_results(payload)
            if page_rows:
                merged_rows: list[dict] = []
                for page_row in page_rows:
                    uri = _clean_text(page_row.get("uri"))
                    merged_rows.append(
                        _merge_skill_metadata(page_row, metadata_by_uri.get(uri) if uri else None)
                    )
                rows.extend(merged_rows)
            else:
                print(f"Recovering language={language} page={page + 1}/{pages} (empty full page)")
                fallback_pages += 1
                for row_index in _row_range_for_page(page=page, limit=limit, total=total):
                    recovered, mode = _recover_row(language=language, row_index=row_index)
                    fallback_rows += 1
                    if recovered is None:
                        skipped_rows += 1
                        continue
                    if mode == "resource":
                        recovered_resource += 1
                    elif mode == "basic":
                        recovered_basic += 1
                    uri = _clean_text(recovered.get("uri"))
                    rows.append(_merge_skill_metadata(recovered, metadata_by_uri.get(uri) if uri else None))
        except EscoRequestError as e:
            if e.code in RETRYABLE_HTTP_CODES:
                print(
                    f"Recovering language={language} page={page + 1}/{pages} "
                    f"(error {e.code})"
                )
                fallback_pages += 1
                for row_index in _row_range_for_page(page=page, limit=limit, total=total):
                    recovered, mode = _recover_row(language=language, row_index=row_index)
                    fallback_rows += 1
                    if recovered is None:
                        skipped_rows += 1
                        continue
                    if mode == "resource":
                        recovered_resource += 1
                    elif mode == "basic":
                        recovered_basic += 1
                    uri = _clean_text(recovered.get("uri"))
                    rows.append(_merge_skill_metadata(recovered, metadata_by_uri.get(uri) if uri else None))
            else:
                raise

        if page == 0 or ((page + 1) % 10 == 0) or (page + 1 == pages):
            print(f"Fetched language={language}: page {page + 1}/{pages}, rows={len(rows)}")

    return rows, {
        "language": language,
        "total": total,
        "pages": pages,
        "rows": len(rows),
        "fallback_pages": fallback_pages,
        "fallback_rows": fallback_rows,
        "fallback_recovered_resource": recovered_resource,
        "fallback_recovered_basic": recovered_basic,
        "fallback_skipped_rows": skipped_rows,
    }


@dataclass
class SkillAccumulator:
    concept_uri: str
    preferred_label: dict[str, str] = field(default_factory=lambda: {"en": "", "fr": ""})
    alternative_label: dict[str, set[str]] = field(
        default_factory=lambda: {"en": set(), "fr": set()}
    )
    description: dict[str, str] = field(default_factory=lambda: {"en": "", "fr": ""})
    scope_note: dict[str, str] = field(default_factory=lambda: {"en": "", "fr": ""})
    skill_type: str = ""
    reuse_level: str = ""

    def to_record(self) -> dict:
        return {
            "concept_uri": self.concept_uri,
            "skill_type": self.skill_type,
            "reuse_level": self.reuse_level,
            "preferred_label": {
                "en": self.preferred_label["en"],
                "fr": self.preferred_label["fr"],
            },
            "alternative_label": {
                "en": _ci_sort(self.alternative_label["en"]),
                "fr": _ci_sort(self.alternative_label["fr"]),
            },
            "description": {
                "en": self.description["en"],
                "fr": self.description["fr"],
            },
            "scope_note": {
                "en": self.scope_note["en"],
                "fr": self.scope_note["fr"],
            },
        }


def build_index_from_esco(api_limit: int) -> tuple[list[dict], dict]:
    language_rows: dict[str, list[dict]] = {}
    language_stats: dict[str, dict] = {}
    for language in SUPPORTED_LANGUAGES:
        rows, stats = fetch_skill_pages(language=language, limit=api_limit)
        language_rows[language] = rows
        language_stats[language] = stats

    skills: dict[str, SkillAccumulator] = {}
    for language in SUPPORTED_LANGUAGES:
        for row in language_rows[language]:
            concept_uri = _clean_text(row.get("uri") if isinstance(row, dict) else "")
            if not concept_uri:
                continue

            acc = skills.setdefault(concept_uri, SkillAccumulator(concept_uri=concept_uri))

            has_skill_type = row.get("hasSkillType") if isinstance(row, dict) else None
            if isinstance(has_skill_type, list) and has_skill_type and not acc.skill_type:
                first = has_skill_type[0]
                if isinstance(first, str):
                    acc.skill_type = _extract_uri_tail(first)

            has_reuse_level = row.get("hasReuseLevel") if isinstance(row, dict) else None
            if isinstance(has_reuse_level, list) and has_reuse_level and not acc.reuse_level:
                first = has_reuse_level[0]
                if isinstance(first, str):
                    acc.reuse_level = _extract_uri_tail(first)

            pref = row.get("preferredLabel") if isinstance(row, dict) else None
            alt = row.get("alternativeLabel") if isinstance(row, dict) else None
            desc = row.get("description") if isinstance(row, dict) else None
            scope = row.get("scopeNote") if isinstance(row, dict) else None

            for lang in SUPPORTED_LANGUAGES:
                pref_text = _extract_localized_text(pref, lang)
                if pref_text:
                    acc.preferred_label[lang] = pref_text

                alt_labels = _extract_localized_list(alt, lang)
                for label in alt_labels:
                    if label.casefold() != acc.preferred_label[lang].casefold():
                        acc.alternative_label[lang].add(label)

                desc_text = _extract_localized_text(desc, lang)
                if desc_text:
                    acc.description[lang] = desc_text

                scope_text = _extract_localized_text(scope, lang)
                if scope_text:
                    acc.scope_note[lang] = scope_text

            title = _clean_text(row.get("title") if isinstance(row, dict) else "")
            if title and not acc.preferred_label[language]:
                acc.preferred_label[language] = title

    records: list[dict] = []
    skipped_without_label = 0
    for concept_uri in _ci_sort(skills.keys()):
        acc = skills[concept_uri]
        if not acc.preferred_label["en"] and not acc.preferred_label["fr"]:
            skipped_without_label += 1
            continue
        if not acc.preferred_label["en"]:
            acc.preferred_label["en"] = acc.preferred_label["fr"]
        if not acc.preferred_label["fr"]:
            acc.preferred_label["fr"] = acc.preferred_label["en"]
        records.append(acc.to_record())

    records.sort(
        key=lambda r: (
            (r["preferred_label"]["en"] or r["preferred_label"]["fr"]).casefold(),
            r["concept_uri"],
        )
    )

    with_description_en = sum(1 for r in records if r["description"]["en"])
    with_description_fr = sum(1 for r in records if r["description"]["fr"])
    with_scope_en = sum(1 for r in records if r["scope_note"]["en"])
    with_scope_fr = sum(1 for r in records if r["scope_note"]["fr"])

    stats = {
        "skills_total": len(records),
        "skills_with_description_en": with_description_en,
        "skills_with_description_fr": with_description_fr,
        "skills_with_scope_note_en": with_scope_en,
        "skills_with_scope_note_fr": with_scope_fr,
        "skills_without_label_skipped": skipped_without_label,
        "api": language_stats,
    }
    return records, stats


def write_json(records: list[dict], stats: dict, output_json: Path) -> None:
    output_json.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": "https://ec.europa.eu/esco/api/search?type=skill&full=true",
            "languages": list(SUPPORTED_LANGUAGES),
            **stats,
        },
        "skills": records,
    }
    with output_json.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote JSON index: {output_json} ({len(records)} skills)")


def _chunked(items: list[dict], size: int) -> Iterable[list[dict]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _to_db_row(record: dict, upserted_at: str) -> dict:
    preferred = record.get("preferred_label") or {}
    alternative = record.get("alternative_label") or {}
    description = record.get("description") or {}
    scope_note = record.get("scope_note") or {}
    return {
        "concept_uri": record["concept_uri"],
        "skill_type": _clean_text(record.get("skill_type")),
        "reuse_level": _clean_text(record.get("reuse_level")),
        "preferred_label_en": _clean_text(preferred.get("en")) or _clean_text(preferred.get("fr")),
        "preferred_label_fr": _clean_text(preferred.get("fr")) or _clean_text(preferred.get("en")),
        "alternative_label_en": alternative.get("en") or [],
        "alternative_label_fr": alternative.get("fr") or [],
        "description_en": _clean_text(description.get("en")),
        "description_fr": _clean_text(description.get("fr")),
        "scope_note_en": _clean_text(scope_note.get("en")),
        "scope_note_fr": _clean_text(scope_note.get("fr")),
        "updated_at": upserted_at,
    }


def upsert_supabase(records: list[dict], supabase_url: str, service_role_key: str, batch_size: int) -> None:
    if not supabase_url or not service_role_key:
        raise ValueError(
            "Missing Supabase credentials. Provide --supabase-url and --supabase-key "
            "or set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY."
        )
    if batch_size <= 0:
        raise ValueError("--batch-size must be > 0")

    base_url = supabase_url.rstrip("/")
    endpoint = f"{base_url}/rest/v1/esco_skills?on_conflict=concept_uri"
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    print(f"Upserting {len(records)} skills to {endpoint} ...")
    upserted_at = datetime.now(timezone.utc).isoformat()
    sent = 0
    for chunk in _chunked(records, batch_size):
        db_rows = [_to_db_row(record, upserted_at) for record in chunk]
        body = json.dumps(db_rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        req = Request(endpoint, data=body, headers=headers, method="POST")
        try:
            with urlopen(req, timeout=60) as resp:  # nosec B310
                if resp.status < 200 or resp.status >= 300:
                    raise RuntimeError(f"Unexpected Supabase status {resp.status}")
        except HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase upsert failed ({e.code}): {detail[:600]}") from e
        except URLError as e:
            raise RuntimeError(f"Supabase upsert request failed: {e}") from e

        sent += len(chunk)
        print(f"  Upserted {sent}/{len(records)}")

    print("Supabase upsert complete.")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build ESCO skills index from ESCO API.")
    parser.add_argument(
        "--input-json",
        type=Path,
        default=None,
        help="Optional path to existing JSON index. If set, skips API fetch and loads records from JSON.",
    )
    parser.add_argument(
        "--json-out",
        type=Path,
        default=DEFAULT_JSON_OUT,
        help=f"Output JSON path (default: {DEFAULT_JSON_OUT})",
    )
    parser.add_argument(
        "--skip-json",
        action="store_true",
        help="Skip writing JSON output.",
    )
    parser.add_argument(
        "--api-limit",
        type=int,
        default=200,
        help="API page size for ESCO search endpoint (default: 200).",
    )
    parser.add_argument(
        "--upsert-db",
        action="store_true",
        help="Upsert normalized records into Supabase public.esco_skills.",
    )
    parser.add_argument(
        "--supabase-url",
        default=os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "",
        help="Supabase project URL (default from env SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL).",
    )
    parser.add_argument(
        "--supabase-key",
        default=os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "",
        help="Supabase service role key (default from env SUPABASE_SERVICE_ROLE_KEY).",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Upsert batch size for Supabase (default: 500).",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if args.input_json:
        with args.input_json.open("r", encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            raise RuntimeError(f"Invalid JSON payload in {args.input_json}")
        skills = payload.get("skills")
        if not isinstance(skills, list):
            raise RuntimeError(f"JSON file missing 'skills' list: {args.input_json}")
        records = [r for r in skills if isinstance(r, dict)]
        print(f"Loaded ESCO index from JSON: {args.input_json} ({len(records)} skills)")
    else:
        records, stats = build_index_from_esco(api_limit=args.api_limit)
        print(
            "Built ESCO index: "
            f"{stats['skills_total']} skills "
            f"(EN descriptions: {stats['skills_with_description_en']}, "
            f"FR descriptions: {stats['skills_with_description_fr']})."
        )

    if not args.skip_json:
        stats_for_write = {
            "skills_total": len(records),
            "skills_with_description_en": sum(1 for r in records if (r.get("description") or {}).get("en")),
            "skills_with_description_fr": sum(1 for r in records if (r.get("description") or {}).get("fr")),
            "skills_with_scope_note_en": sum(1 for r in records if (r.get("scope_note") or {}).get("en")),
            "skills_with_scope_note_fr": sum(1 for r in records if (r.get("scope_note") or {}).get("fr")),
            "skills_without_label_skipped": 0,
            "api": {},
        }
        write_json(records, stats_for_write, args.json_out)

    if args.upsert_db:
        upsert_supabase(
            records,
            supabase_url=args.supabase_url,
            service_role_key=args.supabase_key,
            batch_size=args.batch_size,
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
