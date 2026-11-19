# CodeRabbit Round 4 Fixes

Fixes applied to address 7 valid issues from CodeRabbit review round 4 on the sector taxonomy v2.5 implementation.

**Watch for:** All identified issues have been correctly addressed. The CTE fix preserves atomicity, the tempfile implementation prevents collisions, and the crosswalk normalization handles whitespace-only sources correctly. **Verdict**: APPROVED

## High-level view

The import script now sorts sectors by category_id for stable output regardless of workbook row order, validates JSON strictness by rejecting non-finite floats before file replacement, and uses unique temporary files to prevent concurrent import collisions. The Environment & Circular Economy mapping to ISIC waste division was correctly broadened from exactMatch to broadMatch in both the SSSOM table and sector metadata. The SQL migration atomically records and clears the community-civic-infrastructure cohort in a single CTE statement, ensuring the recorded set matches the cleared set exactly. The TypeScript test now requires an empty result for wrong-source CQCM lookups rather than only checking the source field. The Python crosswalk resolver normalizes whitespace-only source parameters to None, enabling label-only match fallback.

<details>
<summary>Issues (7)</summary>

1. **Import script output order** — Sort sectors by category_id before publishing so workbook row reordering doesn't change the generated taxonomy order.

2. **JSON serialization safety** — Add allow_nan=False to json.dumps so non-finite floats fail serialization before the file is replaced.

3. **Concurrent import collision** — Use tempfile.mkstemp to generate unique temporary files per invocation, preventing collisions when imports run concurrently.

4. **ISIC mapping granularity** — Change Environment & Circular Economy / ISIC Rev. 4 waste division 38 from skos:exactMatch to skos:broadMatch since the sector includes renewable energy and climate advocacy beyond just waste management.

5. **Migration atomicity** — Combine organization clearing and cohort recording in a data-modifying CTE so the recorded IDs are exactly those whose sector_id was cleared.

6. **Test precision** — Assert that resolveCrosswalkMatches returns an empty array for CQCM labels with wrong source, not just that no match has that source.

7. **Whitespace-only source normalization** — Normalize whitespace-only source values to None before lookup key generation so label-only matches can resolve.

</details>

<details>
<summary>Details</summary>

## Import script output stability and JSON strictness

The import script now sorts the sectors array by category_id after building it from workbook rows (line 340):

```python
sectors.sort(key=lambda s: s["category_id"])
```

The json.dumps call rejects non-finite floats (line 220):

```python
f.write(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
```

If a workbook cell contains NaN or Infinity, serialization fails with ValueError before the temporary file replaces the existing sectors.json.

## Temporary file uniqueness

The write function uses tempfile.mkstemp for unique per-invocation temporary files (lines 208-225):

```python
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

The file descriptor is properly closed before replacement. Cleanup removes only the file created by that invocation. Concurrent imports each create a unique `.sectors.json.<random>.tmp` file without collision.

## ISIC mapping predicate correction

The Environment & Circular Economy / ISIC Rev. 4 waste division 38 mapping was changed from skos:exactMatch to skos:broadMatch in both the SSSOM table (sectors.json line 330) and sector skos metadata (line 1133). Environment & Circular Economy encompasses renewable energy generation, climate advocacy, and conservation alongside waste/recycling, making it broader than ISIC division 38 (which covers only waste collection, treatment, and recycling).

## Migration CTE atomicity

The migration combines the cohort recording and sector_id clearing in a single data-modifying CTE (lines 39-49):

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

The RETURNING clause feeds exactly the cleared organization IDs into the cohort table. No writes can occur between recording and clearing—they happen atomically in one statement.

## TypeScript test assertion precision

The CQCM wrong-source test now asserts the full result is empty (wev-bulletin/lib/sectors.test.ts lines 96-98):

```typescript
expect(
  resolveCrosswalkMatches('CQCM Not a sector: role / function', 'cmc')
).toEqual([]);
```

Previously the test checked that no match had source 'cmc', which would pass if a source-less global alias matched. The new assertion requires zero matches, catching any alias leakage.

## Whitespace-only source normalization

The resolve_crosswalk_matches function now treats whitespace-only source values as None (wev-scraper/utils/sector_crosswalk.py line 215):

```python
source_key = source.strip().lower() if (source and source.strip()) else None
```

Previously `source.strip().lower()` returned an empty string for whitespace-only inputs, blocking label-only matches. The fix checks that source.strip() is truthy before lowercasing, enabling label-only match fallback when source is whitespace.

## Skipped issues

Five issues were correctly skipped as already fixed or not applicable:

- **canonicalize_sector_id rejection** — The migration cleared 'community-civic-infrastructure' from the database. Backfill scripts process only NULL sector_id rows, so they'll never see this value. The legacy_id_map mapping is needed for bulletin UI filters supporting legacy URLs.

- **Wrong-source test assertion** — The test at line ~140 uses `resolve_sector_from_crosswalk`, which returns a single ID or None. The `is None` assertion is correct for that return type.

- **Test environment scoping** — The test uses pytest's monkeypatch fixture, which automatically restores environment changes. No manual patch.dict needed.

- **parse_crosswalk_cell refactoring** — Marked "Back-compat" for legacy code. Changing it to call _strip_source_cell could break legacy callers.

- **Source category preference restriction** — Already restricts preference to verified sector IDs from `resolved_sector_ids` and `facet_ids` keys (lines 256-270). Unresolved terms output separately as context.

</details>

<details>
<summary>File map</summary>

**Core fixes:**
- `scripts/import_sector_taxonomy_from_xlsx.py` — Added sector sorting, allow_nan=False, and unique tempfile handling
- `shared/taxonomy/SSE_sector_taxonomy_crosswalk_MASTER.xlsx` — Updated Environment/ISIC mapping to broadMatch
- `shared/taxonomy/sectors.json` — Regenerated with sorted sectors and corrected ISIC predicate
- `supabase/migrations/20261119120000_remap_org_sector_ids_v25.sql` — Replaced separate INSERT/UPDATE with atomic CTE
- `wev-bulletin/lib/sectors.test.ts` — Changed CQCM test to assert empty array
- `wev-scraper/utils/sector_crosswalk.py` — Added whitespace-only source normalization

See `git diff main --stat` for the full 101-file changeset in this branch (sector taxonomy v2.5 implementation + review fixes).

</details>
