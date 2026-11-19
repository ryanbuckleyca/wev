import sharedSectors from '@shared/taxonomy/sectors.json';
import { isGovernanceCategory } from '@/lib/organizations/governance-taxonomy';
import { canonicalizeSectorId, SECTORS_LIST } from '@/lib/sectors';

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
  governance_category?: string | null;
  sector_id: string | null;
};

const EXAMPLE_PREFIX = /^(example|exemple)\s*:\s*/i;

/** Public blurb for a sector card — taxonomy example with the "Example:" prefix stripped. */
export function sectorBlurb(sectorId: string, locale: string): string | null {
  const canonical = canonicalizeSectorId(sectorId);
  if (!canonical) return null;
  const entry = sharedSectors.sectors.find((s) => s.id === canonical);
  if (!entry) return null;
  const raw = locale.startsWith('fr') ? entry.example_fr : entry.example_en;
  if (!raw?.trim()) return null;
  return raw.replace(EXAMPLE_PREFIX, '').trim();
}

/**
 * Aggregate org rows into one card per taxonomy sector (taxonomy order).
 * Mix counts use governance_category (SSE categories only).
 *
 * Rollout window: deploy the remap migration
 * (`20261119120000_remap_org_sector_ids_v25`) with this UI. Cards canonicalize
 * legacy v1 `sector_id` values so counts stay populated if the UI briefly leads
 * the migration; list filters expand canonical IDs with matching legacy stored
 * IDs via `expandSectorFilterIds` so `get_active_organizations` stays consistent
 * with these card counts during that window. Ambiguous
 * `community-civic-infrastructure` rows are cleared to NULL for LLM reassessment
 * rather than force-mapped — they do not inflate the community-development card.
 */
export function buildSectorIndexCards(rows: OrgSectorRow[]): SectorIndexCard[] {
  const bySector = new Map<
    string,
    { orgCount: number; types: Map<string, number>; names: string[] }
  >();

  for (const row of rows) {
    const sectorId = canonicalizeSectorId(row.sector_id);
    if (!sectorId) continue;

    let bucket = bySector.get(sectorId);
    if (!bucket) {
      bucket = { orgCount: 0, types: new Map(), names: [] };
      bySector.set(sectorId, bucket);
    }

    bucket.orgCount += 1;

    const category =
      row.governance_category && isGovernanceCategory(row.governance_category)
        ? row.governance_category
        : null;
    if (category && category !== 'EXCLUDED') {
      bucket.types.set(category, (bucket.types.get(category) ?? 0) + 1);
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
