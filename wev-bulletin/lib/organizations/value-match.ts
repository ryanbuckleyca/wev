import { type RatedValue } from '@/lib/value-ratings';
import { sqlRankWeight } from './sql-rank-weight';

/**
 * Mirrors the weighted value overlap used by get_active_organizations so the
 * org detail page shows the same score as the index cards.
 */
export interface OrgValueMatch {
  valueScore: number | null;
  sharedValues: string[];
}

function parseRatedValues(raw: unknown): RatedValue[] {
  if (!Array.isArray(raw)) return [];

  const parsed: RatedValue[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item) {
      parsed.push({ value: item });
      continue;
    }
    if (item && typeof item === 'object' && 'value' in item) {
      const value = String((item as RatedValue).value ?? '');
      if (!value) continue;
      const rank = (item as RatedValue).rank;
      parsed.push({
        value,
        rank: typeof rank === 'number' ? rank : undefined,
      });
    }
  }
  return parsed;
}

function ratedWeight(rank: number | undefined, total: number): number {
  if (rank == null || total <= 0) return 1.0;
  return sqlRankWeight(rank, total);
}

export function computeOrgValueMatch(
  userValuesRated: RatedValue[] | null | undefined,
  orgValuesList: string[] | null | undefined,
  orgValuesRated: unknown,
): OrgValueMatch {
  if (!orgValuesList || orgValuesList.length === 0) {
    return { valueScore: null, sharedValues: [] };
  }

  const userRated = userValuesRated ?? [];
  const orgRated = parseRatedValues(orgValuesRated);
  const orgRatedTotal = orgRated.length;
  const orgWeightByValue = new Map(
    orgRated.map((rv) => [rv.value, ratedWeight(rv.rank, orgRatedTotal)]),
  );

  const userTotal = userRated.length;
  const userWeights = userRated.map((rv) => ({
    val: rv.value,
    weight: ratedWeight(rv.rank, userTotal),
  }));
  const totalW = userWeights.reduce((sum, uw) => sum + uw.weight, 0);

  const orgValueSet = new Set(orgValuesList);
  const shared = userWeights.filter((uw) => orgValueSet.has(uw.val));
  const sharedValues = shared.map((uw) => uw.val);

  if (totalW === 0) {
    return { valueScore: 0, sharedValues };
  }

  const overlapNum = shared.reduce(
    (sum, uw) => sum + uw.weight * (orgWeightByValue.get(uw.val) ?? 1.0),
    0,
  );
  const valueScore = Math.min(overlapNum / totalW + Math.min(shared.length * 0.1, 0.3), 1.0);

  return { valueScore, sharedValues };
}
