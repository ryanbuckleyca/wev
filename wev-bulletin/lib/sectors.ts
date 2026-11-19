import sharedSectors from '@shared/taxonomy/sectors.json';

export const SECTOR_TAXONOMY_VERSION =
  'version' in sharedSectors && typeof sharedSectors.version === 'string'
    ? sharedSectors.version
    : '1.0';

export const CROSSWALK_SOURCE_IDS = [
  'cmc',
  'chantier',
  'ccednet_buy_social',
  'ripess',
] as const;

export type CrosswalkSourceId = (typeof CROSSWALK_SOURCE_IDS)[number];

export type SectorTaxonomyEntry = (typeof sharedSectors.sectors)[number];

export const SECTORS_LIST = sharedSectors.sectors.map((s) => s.id);

export function isValidSector(id: string | null | undefined): boolean {
  if (!id) return false;
  return SECTORS_LIST.includes(id);
}

export function getSectorEntry(id: string): SectorTaxonomyEntry | undefined {
  return sharedSectors.sectors.find((s) => s.id === id);
}

/** Lowercase, strip accents/punctuation, collapse whitespace for alias match. */
export function normalizeCrosswalkTerm(term: string | null | undefined): string {
  if (!term) return '';
  const stripped = term
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped;
}

const NO_EQUIVALENT_RE = /^\(\s*no direct equivalent\s*\)$/i;
const INCLUDED_IN_RE = /^\(\s*included in\s+(.+?)\s*\)$/i;
const COVERED_UNDER_RE = /^\(\s*covered under\s+(.+?)\s*\)$/i;
const TRAILING_PAREN_RE = /\s*\([^)]*\)\s*$/;

/** Exact reverse-lookup aliases from one MASTER-sheet crosswalk cell. */
export function parseCrosswalkCell(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const cell = raw.trim();
  if (NO_EQUIVALENT_RE.test(cell) || INCLUDED_IN_RE.test(cell) || COVERED_UNDER_RE.test(cell)) {
    return [];
  }

  const aliases: string[] = [];
  const seen = new Set<string>();
  for (const part of cell.split(';')) {
    const term = part.trim();
    if (!term || NO_EQUIVALENT_RE.test(term) || INCLUDED_IN_RE.test(term) || COVERED_UNDER_RE.test(term)) {
      continue;
    }
    const candidates = [term];
    const bare = term.replace(TRAILING_PAREN_RE, '').trim();
    if (bare && bare.toLowerCase() !== term.toLowerCase()) candidates.push(bare);
    for (const candidate of candidates) {
      const key = normalizeCrosswalkTerm(candidate);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      aliases.push(candidate);
    }
  }
  return aliases;
}

export type CrosswalkAlias = {
  sectorId: string;
  source: CrosswalkSourceId;
  rawTerm: string;
  normalized: string;
};

export type CrosswalkMatch = {
  sectorId: string;
  source: CrosswalkSourceId;
  matchedTerm: string;
  confidence: 'exact' | 'ambiguous';
};

let _aliasCache: CrosswalkAlias[] | null = null;
let _indexCache: Map<string, CrosswalkAlias[]> | null = null;

function getCrosswalkAliases(): CrosswalkAlias[] {
  if (_aliasCache) return _aliasCache;
  const rows: CrosswalkAlias[] = [];
  for (const sector of sharedSectors.sectors) {
    const crosswalk = sector.term_crosswalk ?? {};
    for (const source of CROSSWALK_SOURCE_IDS) {
      for (const term of parseCrosswalkCell(crosswalk[source])) {
        rows.push({
          sectorId: sector.id,
          source,
          rawTerm: term,
          normalized: normalizeCrosswalkTerm(term),
        });
      }
    }
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

/** Resolve a scraped/source category to sector matches (0..n). */
export function resolveCrosswalkMatches(
  term: string | null | undefined,
  source?: CrosswalkSourceId | null
): CrosswalkMatch[] {
  const key = normalizeCrosswalkTerm(term);
  if (!key) return [];

  let aliases = getCrosswalkIndex().get(key) ?? [];
  if (source) aliases = aliases.filter((a) => a.source === source);

  const bySector = new Map<string, CrosswalkAlias>();
  for (const alias of aliases) {
    if (!bySector.has(alias.sectorId)) bySector.set(alias.sectorId, alias);
  }

  const confidence = bySector.size === 1 ? 'exact' : 'ambiguous';
  return [...bySector.values()].map((alias) => ({
    sectorId: alias.sectorId,
    source: alias.source,
    matchedTerm: alias.rawTerm,
    confidence,
  }));
}

/** Unique sector id for a source term, or null when missing/ambiguous. */
export function resolveSectorFromCrosswalk(
  term: string | null | undefined,
  source?: CrosswalkSourceId | null
): string | null {
  const matches = resolveCrosswalkMatches(term, source);
  if (matches.length !== 1 || matches[0].confidence !== 'exact') return null;
  return matches[0].sectorId;
}

export type SourceCategoriesPayload = {
  raw: string[];
  resolved_sector_ids: string[];
  ambiguous_terms: Array<{ term: string; sector_ids: string[] }>;
  unresolved_terms: string[];
  vocab?: CrosswalkSourceId;
};

/** Structure scraped categories for jobs.extra / org metadata. */
export function buildSourceCategoriesPayload(
  categories: string[] | string | null | undefined,
  vocab?: CrosswalkSourceId | null
): SourceCategoriesPayload {
  const rawList = Array.isArray(categories)
    ? categories.map((c) => c.trim()).filter(Boolean)
    : typeof categories === 'string' && categories.trim()
      ? [categories.trim()]
      : [];

  const resolved: string[] = [];
  const ambiguous: Array<{ term: string; sector_ids: string[] }> = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();

  for (const raw of rawList) {
    const matches = resolveCrosswalkMatches(raw, vocab);
    const sectorIds = matches.map((m) => m.sectorId);
    if (sectorIds.length === 1) {
      const sid = sectorIds[0];
      if (!seen.has(sid)) {
        seen.add(sid);
        resolved.push(sid);
      }
    } else if (sectorIds.length > 1) {
      ambiguous.push({ term: raw, sector_ids: sectorIds });
    } else {
      unresolved.push(raw);
    }
  }

  const payload: SourceCategoriesPayload = {
    raw: rawList,
    resolved_sector_ids: resolved,
    ambiguous_terms: ambiguous,
    unresolved_terms: unresolved,
  };
  if (vocab) payload.vocab = vocab;
  return payload;
}
