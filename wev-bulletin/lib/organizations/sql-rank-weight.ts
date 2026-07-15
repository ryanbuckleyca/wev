/**
 * Mirrors Postgres `rank_weight(rank int, total int)` used by org/job match RPCs.
 * Do not use `getRankWeight` from value-ratings.ts here — different formula.
 */
export function sqlRankWeight(rank: number, total: number): number {
  if (!total) return 1.0;
  return 1.0 - ((rank - 1) / total) * 0.5;
}
