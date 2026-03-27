/**
 * Value and skill rating types.
 *
 * Priority is expressed as a 1-based rank (drag order).
 * Rank 1 = highest priority. Weight decays linearly from 1.0 down to MIN_WEIGHT
 * across the user's selected items.
 *
 * getRankWeight(rank, total) maps position → weight in [MIN_WEIGHT, 1.0].
 */

export type RatedValue = {
  value: string;
  rank?: number; // 1-based drag position; absent = unranked (uses NEUTRAL_WEIGHT)
};

export type JobRatedValue = {
  value: string;
  confidence: number; // 1-based position from LLM output
};

export type RatedSkill = {
  skill: string; // ESCO URI
  rank?: number; // 1-based drag position
};

export const MIN_WEIGHT = 0.25;
export const NEUTRAL_WEIGHT = 0.5;

/**
 * Map a 1-based rank position to a weight in [MIN_WEIGHT, 1.0].
 * Rank 1 → 1.0, rank `total` → MIN_WEIGHT.
 * If total <= 1 or rank is absent, returns NEUTRAL_WEIGHT.
 */
export function getRankWeight(rank: number | undefined, total: number): number {
  if (rank == null || total <= 1) return NEUTRAL_WEIGHT;
  const clamped = Math.max(1, Math.min(rank, total));
  // Linear interpolation: rank 1 → 1.0, rank total → MIN_WEIGHT
  return 1.0 - ((clamped - 1) / (total - 1)) * (1.0 - MIN_WEIGHT);
}

/** @deprecated Use getRankWeight. Kept for backward compat with old tier strings. */
export type ValueTier = "essential" | "nice_to_have";
export const TIER_WEIGHTS: Record<ValueTier, number> = {
  essential: 1.0,
  nice_to_have: MIN_WEIGHT,
};
export function getTierWeight(tier: ValueTier | string | undefined): number {
  if (tier === undefined || tier === null) return NEUTRAL_WEIGHT;
  return (TIER_WEIGHTS as Record<string, number>)[tier] ?? NEUTRAL_WEIGHT;
}
