import sharedSectors from '@shared/taxonomy/sectors.json';

export const SECTOR_TAXONOMY_VERSION =
  'version' in sharedSectors && typeof sharedSectors.version === 'string'
    ? sharedSectors.version
    : '2.5';

export type SectorTaxonomyEntry = (typeof sharedSectors.sectors)[number];
export type SectorFacetEntry = (typeof sharedSectors.facets)[number];

export const CROSSWALK_SOURCE_IDS = Object.keys(sharedSectors.crosswalk_sources ?? {}) as string[];

export type CrosswalkSourceId = string;

/** Industry sector IDs only (excludes role/population/employer facets). */
export const SECTORS_LIST = sharedSectors.sectors.map((s) => s.id);

const LEGACY_ID_MAP: Record<string, string> = {
  ...(sharedSectors.legacy_id_map ?? {}),
};

/** Canonical v2.5 id → retired v1 ids that still may be stored pre-remap. */
const LEGACY_IDS_BY_CANONICAL: Record<string, string[]> = (() => {
  const reverse: Record<string, string[]> = {};
  for (const [legacy, canonical] of Object.entries(LEGACY_ID_MAP)) {
    if (!legacy || !canonical || legacy === canonical) continue;
    (reverse[canonical] ??= []).push(legacy);
  }
  return reverse;
})();

export function canonicalizeSectorId(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  const mapped = LEGACY_ID_MAP[trimmed] ?? trimmed;
  return SECTORS_LIST.includes(mapped) ? mapped : null;
}

/**
 * Expand canonical sector filter IDs with matching legacy DB values so
 * get_active_organizations stays consistent with buildSectorIndexCards during
 * the remap-migration rollout window.
 */
export function expandSectorFilterIds(sectorIds: string[]): string[] {
  const out = new Set<string>();
  for (const raw of sectorIds) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const canonical = canonicalizeSectorId(trimmed) ?? trimmed;
    out.add(canonical);
    for (const legacy of LEGACY_IDS_BY_CANONICAL[canonical] ?? []) {
      out.add(legacy);
    }
    // Keep the raw value too when it was already a legacy id.
    out.add(trimmed);
  }
  return [...out];
}

export function isValidSector(id: string | null | undefined): boolean {
  return canonicalizeSectorId(id) !== null;
}

export function getSectorEntry(id: string): SectorTaxonomyEntry | undefined {
  const canonical = canonicalizeSectorId(id);
  if (!canonical) return undefined;
  return sharedSectors.sectors.find((s) => s.id === canonical);
}

/** Lowercase, strip accents/punctuation, collapse whitespace for alias match. */
export function normalizeCrosswalkTerm(term: string | null | undefined): string {
  if (!term) return '';
  return term
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripSourceCell(raw: string): string {
  return raw
    .replace(/^[^:]+:\s*/, '')
    .replace(/\s+(jobs|tags)$/i, '')
    .trim();
}

export function parseCrosswalkCell(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const text = stripSourceCell(raw.trim());
  return text ? [text] : [];
}

export type CrosswalkAlias = {
  entryId: string;
  kind: 'sector' | 'facet';
  source: string | null;
  rawTerm: string;
  normalized: string;
};

export type CrosswalkMatch = {
  entryId: string;
  kind: 'sector' | 'facet';
  source: string | null;
  matchedTerm: string;
  confidence: 'exact' | 'ambiguous';
};

let _aliasCache: CrosswalkAlias[] | null = null;
let _indexCache: Map<string, CrosswalkAlias[]> | null = null;

function aliasesForEntry(
  entry: SectorTaxonomyEntry | SectorFacetEntry,
  kind: 'sector' | 'facet',
): CrosswalkAlias[] {
  // Unscoped (global) terms: preferred labels + curated aliases only.
  // Workbook source cells stay source-scoped so CMC-only wording cannot match
  // a GoodWork lookup via an unscoped alias.
  const globalTerms = new Set<string>();
  globalTerms.add(entry.label_en);
  globalTerms.add(entry.label_fr);
  for (const alias of entry.aliases ?? []) globalTerms.add(alias);

  const rows: CrosswalkAlias[] = [];
  for (const term of globalTerms) {
    const normalized = normalizeCrosswalkTerm(term);
    if (!normalized) continue;
    rows.push({
      entryId: entry.id,
      kind,
      source: null,
      rawTerm: term,
      normalized,
    });
  }
  for (const [source, raw] of Object.entries(entry.term_crosswalk ?? {})) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const term = stripSourceCell(raw);
    const normalized = normalizeCrosswalkTerm(term);
    if (!normalized) continue;
    rows.push({
      entryId: entry.id,
      kind,
      source,
      rawTerm: term,
      normalized,
    });
  }
  return rows;
}

function getCrosswalkAliases(): CrosswalkAlias[] {
  if (_aliasCache) return _aliasCache;
  const rows: CrosswalkAlias[] = [];
  for (const sector of sharedSectors.sectors) {
    rows.push(...aliasesForEntry(sector, 'sector'));
  }
  for (const facet of sharedSectors.facets ?? []) {
    rows.push(...aliasesForEntry(facet, 'facet'));
  }
  _aliasCache = rows;
  return rows;
}

function getCrosswalkIndex(): Map<string, CrosswalkAlias[]> {
  if (_indexCache) return _indexCache;
  const index = new Map<string, CrosswalkAlias[]>();
  for (const alias of getCrosswalkAliases()) {
    const list = index.get(alias.normalized) ?? [];
    list.push(alias);
    index.set(alias.normalized, list);
  }
  _indexCache = index;
  return index;
}

function candidateKeys(term: string | null | undefined): string[] {
  if (!term?.trim()) return [];
  const raw = term.trim();
  const variants = [raw];
  const stripped = stripSourceCell(raw);
  if (stripped && stripped !== raw) variants.push(stripped);
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const variant of variants) {
    const key = normalizeCrosswalkTerm(variant);
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

export function resolveCrosswalkMatches(
  term: string | null | undefined,
  source?: CrosswalkSourceId | null,
  includeFacets = true,
): CrosswalkMatch[] {
  const keys = candidateKeys(term);
  if (!keys.length) return [];

  const index = getCrosswalkIndex();
  let aliases: CrosswalkAlias[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    for (const alias of index.get(key) ?? []) {
      const ident = `${alias.kind}:${alias.entryId}:${alias.source}:${alias.normalized}`;
      if (seen.has(ident)) continue;
      seen.add(ident);
      aliases.push(alias);
    }
  }
  if (source) {
    aliases = aliases.filter((a) => a.source === null || a.source === source);
  }
  if (!includeFacets) aliases = aliases.filter((a) => a.kind === 'sector');

  const byEntry = new Map<string, CrosswalkAlias>();
  for (const alias of aliases) {
    const mapKey = `${alias.kind}:${alias.entryId}`;
    if (!byEntry.has(mapKey)) byEntry.set(mapKey, alias);
  }

  const confidence = byEntry.size === 1 ? 'exact' : 'ambiguous';
  return [...byEntry.values()].map((alias) => ({
    entryId: alias.entryId,
    kind: alias.kind,
    source: alias.source,
    matchedTerm: alias.rawTerm,
    confidence,
  }));
}

export function resolveSectorFromCrosswalk(
  term: string | null | undefined,
  source?: CrosswalkSourceId | null,
): string | null {
  const matches = resolveCrosswalkMatches(term, source, false).filter((m) => m.kind === 'sector');
  const ids = [...new Set(matches.map((m) => m.entryId))];
  return ids.length === 1 ? ids[0] : null;
}

export type SourceCategoriesPayload = {
  raw: string[];
  resolved_sector_ids: string[];
  facet_ids: string[];
  ambiguous_terms: Array<{
    term: string;
    sector_ids: string[];
    facet_ids: string[];
  }>;
  unresolved_terms: string[];
  vocab?: string;
};

export function buildSourceCategoriesPayload(
  categories: string[] | string | null | undefined,
  vocab?: CrosswalkSourceId | null,
): SourceCategoriesPayload {
  const rawList = Array.isArray(categories)
    ? categories.map((c) => c.trim()).filter(Boolean)
    : typeof categories === 'string' && categories.trim()
      ? [categories.trim()]
      : [];

  const resolved: string[] = [];
  const facetIds: string[] = [];
  const ambiguous: SourceCategoriesPayload['ambiguous_terms'] = [];
  const unresolved: string[] = [];
  const seenSectors = new Set<string>();
  const seenFacets = new Set<string>();

  for (const raw of rawList) {
    const matches = resolveCrosswalkMatches(raw, vocab, true);
    const sectorIds = [
      ...new Set(matches.filter((m) => m.kind === 'sector').map((m) => m.entryId)),
    ];
    const facets = [...new Set(matches.filter((m) => m.kind === 'facet').map((m) => m.entryId))];
    if (sectorIds.length === 1 && facets.length === 0) {
      if (!seenSectors.has(sectorIds[0])) {
        seenSectors.add(sectorIds[0]);
        resolved.push(sectorIds[0]);
      }
    } else if (facets.length === 1 && sectorIds.length === 0) {
      if (!seenFacets.has(facets[0])) {
        seenFacets.add(facets[0]);
        facetIds.push(facets[0]);
      }
    } else if (sectorIds.length || facets.length) {
      ambiguous.push({ term: raw, sector_ids: sectorIds, facet_ids: facets });
    } else {
      unresolved.push(raw);
    }
  }

  const payload: SourceCategoriesPayload = {
    raw: rawList,
    resolved_sector_ids: resolved,
    facet_ids: facetIds,
    ambiguous_terms: ambiguous,
    unresolved_terms: unresolved,
  };
  if (vocab) payload.vocab = vocab;
  return payload;
}
