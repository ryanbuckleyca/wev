# Sector Taxonomy Fix Plan

This plan addresses 12 issues from the CodeRabbit review. Each issue was verified against the current codebase.

## Issue Verification Summary

- **7 VALID**: Need fixing
- **5 SKIP**: Already fixed or not applicable

---

## VALID ISSUES - REQUIRE FIXES

### FILE 1: scripts/import_sector_taxonomy_from_xlsx.py

#### Issue A: Sort sectors by category_id before publishing (Line ~390) - **VALID**

**Current state (lines 347-350):**
```python
"sectors": sectors,
"facets": facets,
```

The `sectors` list is built in workbook row order (lines 287-331) and never sorted. If workbook rows are reordered, the output order changes.

**Minimal fix:**
Add sorting before the output dict construction. Insert after line 331 (after sectors/facets are populated):
```python
sectors.sort(key=lambda s: s["category_id"])
```

**Verification:**
Run `python3 scripts/import_sector_taxonomy_from_xlsx.py` and verify the sectors array in `shared/taxonomy/sectors.json` is ordered by category_id (SSE_SEC_01, SSE_SEC_02, ..., SSE_SEC_17).

---

#### Issue B: json.dumps needs allow_nan=False (Line ~211) - **VALID**

**Current state (line 235):**
```python
tmp_path.write_text(
    json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
```

No `allow_nan=False` flag. Non-finite floats (NaN, Infinity) would serialize as non-standard JSON tokens.

**Minimal fix:**
Change line 235 to:
```python
json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
```

**Verification:**
Run the import script and confirm it completes successfully. Test with a modified workbook containing a NaN confidence value to confirm serialization fails before file replacement.

---

#### Issue C: Temporary file needs unique name per invocation (Line ~208) - **VALID**

**Current state (line 234):**
```python
tmp_path = OUT_JSON.with_name(f".{OUT_JSON.name}.tmp")
```

Uses a fixed temp file name `.sectors.json.tmp`. Concurrent imports would collide. The temp file is never explicitly closed before the replace (line 238), and cleanup (line 240) catches any leftover `.sectors.json.tmp` from any invocation.

**Minimal fix:**
Replace lines 234-241 with:
```python
import tempfile

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
```

**Verification:**
Run the import script twice concurrently. Both should succeed without collision. Verify no `.sectors.json.tmp.*` files remain afterward.

---

### FILE 2: shared/taxonomy/sectors.json

#### Issue D: Environment & Circular Economy / ISIC Rev. 4 waste division 38 uses skos:exactMatch (Lines 329-330) - **VALID**

**Current state (lines 329-334 in sssom_mappings):**
```json
{
  "subject_id": "sse_tax:SSE_SEC_08",
  "subject_label": "Environment & Circular Economy",
  "skos_prefLabel_fr": "Environnement, énergie et économie circulaire",
  "predicate_id": "skos:exactMatch",
  "object_id": "isic4:E_38",
  "object_label": "E (38) Waste collection, treatment and recycling",
  "match_type": "HumanCurated",
  "confidence": 0.95,
  "compound_mapping_rule": "skos:exactMatch CircularEconomy AND (skos:narrowMatch RenewableEnergyCoop OR skos:narrowMatch WasteRecycling)"
}
```

Uses `skos:exactMatch`. According to the review, this should be a non-equivalence mapping (e.g., `skos:broadMatch` or `skos:relatedMatch`) because Environment & Circular Economy is broader than just waste management—it includes renewable energy, climate advocacy, conservation, etc.

**Minimal fix:**
This requires TWO changes:
1. Update the MASTER workbook at `/Users/ry/code/wev/scratch/SSE sector taxonomy crosswalk MASTER.xlsx`:
   - Open the "SSSOM Mapping Set (Export)" sheet
   - Find row for SSE_SEC_08 (Environment & Circular Economy) mapped to ISIC Rev. 4 division 38
   - Change `predicate_id` column from `skos:exactMatch` to `skos:broadMatch` (since Environment & Circular Economy is broader than just waste management)
   
2. Regenerate `sectors.json`:
   ```bash
   python3 scripts/import_sector_taxonomy_from_xlsx.py
   ```

**Verification:**
After regeneration, check `shared/taxonomy/sectors.json`:
- Line ~330 should show `"predicate_id": "skos:broadMatch"` (or `skos:relatedMatch`)
- Line ~1127 (in the sector entry's skos metadata) should show `"mapping_predicate": "skos:broadMatch"`

---

### FILE 3: supabase/migrations/20261119120000_remap_org_sector_ids_v25.sql

#### Issue E: Combine organization clearing and cohort recording in one statement (Lines 44-46) - **VALID**

**Current state (lines 40-54):**
```sql
INSERT INTO public.sector_remap_v25_community_civic (organization_id, prior_sector_id)
SELECT id, sector_id
FROM public.organizations
WHERE sector_id = 'community-civic-infrastructure'
ON CONFLICT (organization_id) DO NOTHING;

-- Leave ambiguous residual rows eligible for NULL-only sector backfill.
UPDATE public.organizations
SET sector_id = NULL
WHERE sector_id = 'community-civic-infrastructure';
```

Two separate statements. The organizations recorded might differ from those cleared if writes occur between statements.

**Minimal fix:**
Replace lines 40-54 with:
```sql
WITH cleared AS (
  UPDATE public.organizations
  SET sector_id = NULL
  WHERE sector_id = 'community-civic-infrastructure'
  RETURNING id, 'community-civic-infrastructure' AS prior_sector_id
)
INSERT INTO public.sector_remap_v25_community_civic (organization_id, prior_sector_id)
SELECT id, prior_sector_id
FROM cleared
ON CONFLICT (organization_id) DO NOTHING;
```

**Verification:**
Apply the migration to a test database with some `community-civic-infrastructure` records. Verify:
1. All such records have `sector_id` cleared to NULL
2. `sector_remap_v25_community_civic` contains exactly those organization IDs

---

### FILE 4: wev-bulletin/lib/sectors.test.ts

#### Issue F: CQCM lookup test should assert full result is empty (Lines 98-99) - **VALID**

**Current state (lines 94-101):**
```typescript
// CQCM facet cells must not collapse into CMC aliases via colon stripping.
expect(
  resolveCrosswalkMatches('CQCM Not a sector: role / function', 'cmc').map((m) => m.source),
).not.toContain('cmc');
expect(
  resolveCrosswalkMatches('Not a sector: role / function').some(
    (m) => m.entryId === 'facet-role-function',
  ),
).toBe(true);
```

Only checks that no match has `source: 'cmc'`. But a source-less global alias could still pass this test.

**Minimal fix:**
Replace lines 95-98 with:
```typescript
expect(
  resolveCrosswalkMatches('CQCM Not a sector: role / function', 'cmc')
).toEqual([]);
```

Keep the second assertion (lines 99-101) unchanged.

**Verification:**
Run `npm test wev-bulletin/lib/sectors.test.ts` and confirm all tests pass.

---

### FILE 8: wev-scraper/utils/sector_crosswalk.py

#### Issue J: resolve_crosswalk_matches should normalize whitespace-only source values to None (Line ~188) - **VALID**

**Current state (lines 163-176):**
```python
def resolve_crosswalk_matches(
    term: str | None,
    *,
    source: str | None = None,
    include_facets: bool = True,
) -> list[CrosswalkMatch]:
    """Resolve a source category string to zero or more taxonomy matches."""
    source_key = source.strip().lower() if source else None
    keys = _candidate_keys(term, source_key)
    if not keys:
        return []
```

Line 170: `source.strip().lower()` returns an empty string for whitespace-only source values, not None. This prevents label-only matches.

**Minimal fix:**
Change line 170 to:
```python
source_key = source.strip().lower() if (source and source.strip()) else None
```

**Verification:**
Add a test case to `wev-scraper/tests/test_sector_crosswalk.py`:
```python
def test_whitespace_only_source_becomes_none():
    # Whitespace-only source should not mismatch guard
    matches = resolve_crosswalk_matches("Agriculture & Food Systems", source="   ")
    assert len(matches) == 1
    assert matches[0].entry_id == "agriculture-food-systems"
```
Run `pytest wev-scraper/tests/test_sector_crosswalk.py -v` and confirm the new test passes.

---

## SKIP ISSUES - ALREADY FIXED OR NOT APPLICABLE

### FILE 5: wev-scraper/scripts/backfill_org_sectors.py

#### Issue G: canonicalize_sector_id should reject 'community-civic-infrastructure' as None (Line ~113) - **SKIP**

**Current state:**
Line 103-104:
```python
raw_sector = r.get("sector_id")
sector_id = canonicalize_sector_id(raw_sector)
```

The review claims canonicalize_sector_id should reject `'community-civic-infrastructure'` as None. However:

1. `canonicalize_sector_id` is defined in `wev-scraper/utils/sector_prompts.py` (lines 135-148)
2. It uses `get_legacy_sector_id_map()` which comes from `shared/taxonomy/sectors.json` (line 141)
3. The legacy_id_map (sectors.json lines 185-195) maps `"community-civic-infrastructure"` → `"community-development-philanthropy-volunteering"`
4. So `canonicalize_sector_id('community-civic-infrastructure')` returns `'community-development-philanthropy-volunteering'`, not None

**Why this is correct:**
The migration (20261119120000_remap_org_sector_ids_v25.sql) cleared community-civic-infrastructure from the database. The backfill script processes only NULL sector_id rows. So backfill_org_sectors.py will never see 'community-civic-infrastructure' in live data—it was already cleared. The legacy mapping is correct for other code paths (like bulletin UI filters that need to support legacy URLs).

**Action:** No change needed.

---

### FILE 6: wev-scraper/tests/test_sector_crosswalk.py

#### Issue H: Wrong-source lookup assertion should require empty list (Line ~140) - **SKIP**

**Current state (lines 125-136):**
```python
def test_cmc_source_terms_do_not_match_goodwork_lookups():
    assert (
        resolve_sector_from_crosswalk(
            "CMC Housing & Collective Real Estate", source="cmc"
        )
        == "housing-collective-real-estate"
    )
    assert (
        resolve_sector_from_crosswalk(
            "CMC Housing & Collective Real Estate", source="goodwork"
        )
        is None
    )
```

The test uses `resolve_sector_from_crosswalk` which returns a single sector_id or None. The review asks to check that `matches` result is an empty list, but this function doesn't return a list—it returns a single ID.

**Why this is correct:**
The test already correctly asserts the return value `is None` (line 134), which means no sector matched. This is the appropriate assertion for this function's return type.

**If the review meant the underlying function:**
Lines 144-155 test `test_cqcm_facet_cell_does_not_match_cmc_lookup` which DOES use `resolve_crosswalk_matches` (returns a list) and already asserts correctly:
```python
matches = resolve_crosswalk_matches(
    "CQCM Not a sector: role / function", source="cmc"
)
assert not any(m.source == "cmc" for m in matches)
```

This test could be strengthened (same as Issue F), but the current test at line ~140 (test_cmc_source_terms_do_not_match_goodwork_lookups) is already correct for its function signature.

**Action:** No change needed (Issue F addresses the similar facet test).

---

### FILE 7: wev-scraper/tests/test_settings.py

#### Issue I: Test should use scoped patch.dict for environment setup (Lines 56-58) - **SKIP**

**Current state (lines 52-68):**
```python
def test_ensure_env_loaded_fills_package_keys_after_root(monkeypatch, tmp_path):
    scraper_env = tmp_path / "wev-scraper" / ".env"
    root_env = tmp_path / ".env"
    scraper_env.parent.mkdir()
    scraper_env.write_text("SCRAPER_ONLY=from-scraper\nSHARED=from-scraper\n")
    root_env.write_text("ROOT_ONLY=from-root\nSHARED=from-root\n")

    monkeypatch.setattr(settings, "SCRAPER_ROOT", scraper_env.parent)
    monkeypatch.setattr(
        settings,
        "find_dotenv",
        lambda *args, **kwargs: str(root_env),
    )
    monkeypatch.delenv("SCRAPER_ONLY", raising=False)
    monkeypatch.delenv("ROOT_ONLY", raising=False)
    monkeypatch.delenv("SHARED", raising=False)

    settings.ensure_env_loaded()

    assert os.environ["ROOT_ONLY"] == "from-root"
```

**Why this is already correct:**
The test uses pytest's `monkeypatch` fixture (line 52). pytest's monkeypatch automatically restores all environment changes after the test completes—this is its entire purpose. Lines 62-64 use `monkeypatch.delenv()` which is automatically reversed.

The review asks for `patch.dict(os.environ)`, but that's unnecessary when using monkeypatch. The test is already properly scoped.

**Action:** No change needed. The monkeypatch fixture provides automatic cleanup.

---

### FILE 8: wev-scraper/utils/sector_crosswalk.py

#### Issue K: parse_crosswalk_cell should use _strip_source_cell (Lines ~372-373) - **SKIP**

**Current state (lines 378-384):**
```python
# Back-compat: old soft-cell parser no longer applies to v2.5 synthetic cells.
def parse_crosswalk_cell(raw: str | None) -> list[str]:
    """Return searchable aliases from a MASTER source cell."""
    if not raw:
        return []
    text = re.sub(r"^[^:]+:\s*", "", str(raw)).strip()
    text = re.sub(r"\s+(jobs|tags)$", "", text, flags=re.I).strip()
    return [text] if text else []
```

**Why this is correct:**
1. The function is marked as "Back-compat" (line 378)
2. The docstring says "old soft-cell parser no longer applies to v2.5"
3. The current normalization (lines 383-384) already strips board wrappers (`:` prefix) and `jobs`/`tags` suffixes
4. `_strip_source_cell` (lines 154-155) does: `return _split_source_wrapper(raw)[1]` which splits recognized wrappers more precisely
5. However, `parse_crosswalk_cell` is a back-compat function that may be used by old code expecting simple regex stripping

**Why changing it could break:**
- If `parse_crosswalk_cell` is used anywhere that expects the current simple stripping behavior, calling `_strip_source_cell` (which does more sophisticated matching) could change results
- The comment suggests this function is deprecated/legacy

**Action:** No change needed. This is marked as back-compat code and already provides sufficient normalization for its legacy purpose.

---

### FILE 9: wev-scraper/utils/sector_prompts.py

#### Issue L: Sector-matching instruction should restrict preference to verified sector IDs (Lines 191-193) - **SKIP**

**Current state (lines 252-281):**
```python
def _source_category_prompt_lines(org: dict) -> list[str]:
    """Preference hint from verified matches; unresolved raw labels as context only."""
    for candidate in _source_categories_candidates(org):
        if isinstance(candidate, dict):
            verified: list[str] = []
            for key in ("resolved_sector_ids", "facet_ids"):
                values = candidate.get(key)
                if isinstance(values, list):
                    verified.extend(str(v).strip() for v in values if str(v).strip())
            # ... context handling ...
            lines: list[str] = []
            if verified:
                lines.append(
                    "Source category preference (verified): " + ", ".join(verified)
                )
```

**Why this is already correct:**
1. Line 254: Function docstring explicitly states "Preference hint from verified matches"
2. Lines 256-261: Build `verified` list ONLY from `resolved_sector_ids` and `facet_ids` keys
3. Lines 269-270: Only output preference line when `verified` list is non-empty
4. Lines 272-279: Unresolved terms are output separately as "context (unresolved)", NOT as preference
5. Lines 281-283: Plain strings are output as "context", NOT as preference

The function already distinguishes verified IDs (preference) from unresolved labels (context). The prompt template at line 223 instructs:
> "When a SOURCE CATEGORY / directory label is provided and it matches a listed Source alias for a sector, prefer that sector unless the org evidence clearly contradicts it."

This refers to verified matches, which are labeled as "(verified)" in the prompt output.

**Action:** No change needed. The code already restricts preference to verified sector IDs.

---

## Summary

**7 issues require fixes:**
1. ✅ Issue A: Sort sectors by category_id
2. ✅ Issue B: Add allow_nan=False to json.dumps
3. ✅ Issue C: Use unique temp file per import
4. ✅ Issue D: Change Environment/ISIC mapping from exactMatch to broadMatch
5. ✅ Issue E: Combine SQL statements with CTE
6. ✅ Issue F: Assert empty list for wrong-source CQCM lookup
7. ✅ Issue J: Normalize whitespace-only source values to None

**5 issues skipped (already correct or not applicable):**
- Issue G: canonicalize_sector_id behavior is correct for its use case
- Issue H: Test already uses correct assertion for function return type
- Issue I: monkeypatch fixture provides automatic cleanup
- Issue K: Back-compat function should remain unchanged
- Issue L: Function already restricts preference to verified IDs

---

## Implementation Order

1. Fix import script issues (A, B, C) - these are independent
2. Fix MASTER workbook and regenerate (D) - depends on import script fixes
3. Fix SQL migration (E) - independent
4. Fix TypeScript test (F) - independent
5. Fix Python crosswalk code (J) - independent
6. Run full test suite to verify all fixes

Each fix is minimal and preserves existing behavior except where explicitly changing to meet the requirement.
