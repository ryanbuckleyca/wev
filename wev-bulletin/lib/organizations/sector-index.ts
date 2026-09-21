import sharedSectors from '@shared/taxonomy/sectors.json';
import { normalizeOrgType } from '@/lib/organizations/org-type';
import { SECTORS_LIST } from '@/lib/sectors';

export type SectorIndexTypeCount = {
  type: string;
  count: number;
};

export type SectorIndexCard = {
  id: string;
  orgCount: number;
  typeCounts: SectorIndexTypeCount[];
  sampleNames: string[];
};

type OrgSectorRow = {
  name: string | null;
  type: string | null;
  sector_id: string | null;
};

const EXAMPLE_PREFIX = /^(example|exemple)\s*:\s*/i;

/** Public blurb for a sector card — taxonomy example with the "Example:" prefix stripped. */
export function sectorBlurb(sectorId: string, locale: string): string | null {
  const entry = sharedSectors.sectors.find((s) => s.id === sectorId);
  if (!entry) return null;
  const raw = locale.startsWith('fr') ? entry.example_fr : entry.example_en;
  if (!raw?.trim()) return null;
  return raw.replace(EXAMPLE_PREFIX, '').trim();
}

/**
 * Aggregate org rows into one card per taxonomy sector (taxonomy order).
 * Sectors with zero matching orgs are omitted so the grid stays useful.
 */
export function buildSectorIndexCards(rows: OrgSectorRow[]): SectorIndexCard[] {
  const bySector = new Map<
    string,
    { orgCount: number; types: Map<string, number>; names: string[] }
  >();

  for (const row of rows) {
    const sectorId = row.sector_id?.trim();
    if (!sectorId || !SECTORS_LIST.includes(sectorId)) continue;

    let bucket = bySector.get(sectorId);
    if (!bucket) {
      bucket = { orgCount: 0, types: new Map(), names: [] };
      bySector.set(sectorId, bucket);
    }

    bucket.orgCount += 1;

    const canonical = normalizeOrgType(row.type);
    if (canonical) {
      bucket.types.set(canonical, (bucket.types.get(canonical) ?? 0) + 1);
    }

    const name = row.name?.trim();
    if (name && !bucket.names.includes(name)) {
      bucket.names.push(name);
    }
  }

  return SECTORS_LIST.filter((id) => bySector.has(id)).map((id) => {
    const bucket = bySector.get(id)!;
    const typeCounts = Array.from(bucket.types.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

    return {
      id,
      orgCount: bucket.orgCount,
      typeCounts,
      sampleNames: [...bucket.names].sort((a, b) => a.localeCompare(b)).slice(0, 3),
    };
  });
}
