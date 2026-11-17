import {
  EXCLUDED_CATEGORY,
  VALID_CATEGORIES,
  isGovernanceCategory,
  type GovernanceCategory,
} from './governance-taxonomy';

export type GovernanceIndexCard = {
  id: GovernanceCategory;
  orgCount: number;
  sampleNames: string[];
};

type OrgGovernanceRow = {
  name: string | null;
  governance_category: string | null;
};

/**
 * Aggregate org rows into one card per SSE governance category (taxonomy order).
 * EXCLUDED is omitted — the browse grid is an SSE front door.
 */
export function buildGovernanceIndexCards(rows: OrgGovernanceRow[]): GovernanceIndexCard[] {
  const byCategory = new Map<GovernanceCategory, { orgCount: number; names: string[] }>();

  for (const row of rows) {
    const category = row.governance_category?.trim();
    if (!category || !isGovernanceCategory(category) || category === EXCLUDED_CATEGORY) {
      continue;
    }

    let bucket = byCategory.get(category);
    if (!bucket) {
      bucket = { orgCount: 0, names: [] };
      byCategory.set(category, bucket);
    }

    bucket.orgCount += 1;
    const name = row.name?.trim();
    if (name && !bucket.names.includes(name)) {
      bucket.names.push(name);
    }
  }

  return VALID_CATEGORIES.filter(
    (id): id is GovernanceCategory => id !== EXCLUDED_CATEGORY && byCategory.has(id),
  ).map((id) => {
    const bucket = byCategory.get(id)!;
    return {
      id,
      orgCount: bucket.orgCount,
      sampleNames: [...bucket.names].sort((a, b) => a.localeCompare(b)).slice(0, 3),
    };
  });
}
