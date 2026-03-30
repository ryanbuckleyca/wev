/**
 * Shared match-scoring utilities.
 *
 * These pure functions were previously duplicated across:
 *   - lib/match-calculator.ts (calculateUserMatches + calculateJobMatches)
 *   - components/JobCard.tsx (display-side token computation)
 */

import type { RatedValue } from './value-ratings';

// ---------------------------------------------------------------------------
// Location token helpers
// ---------------------------------------------------------------------------

/**
 * Tokenise an ideal-work-environment string into meaningful words (length > 2).
 */
export function tokeniseIdealEnv(idealEnv: string): string[] {
  return idealEnv
    .toLowerCase()
    .split(/[^\w]+/)
    .filter((s) => s.length > 2);
}

/**
 * Build the job text blob used for location matching.
 */
export function buildJobLocationText(
  location: string | null | undefined,
  summary: string | null | undefined,
  description?: string | null | undefined,
): string {
  return [location, summary, description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export interface LocationTokens {
  matched: string[];
  unmatched: string[];
}

/**
 * Compute which ideal-env tokens appear in the job text.
 */
export function computeLocationTokens(
  idealEnv: string | null | undefined,
  jobText: string,
): LocationTokens {
  if (!idealEnv || idealEnv.trim().length === 0) {
    return { matched: [], unmatched: [] };
  }
  const tokens = tokeniseIdealEnv(idealEnv);
  return {
    matched: tokens.filter((t) => jobText.includes(t)),
    unmatched: tokens.filter((t) => !jobText.includes(t)),
  };
}

/**
 * Calculate a location score from pre-computed token lists.
 * Returns null when there are no tokens to match against.
 */
export function scoreLocationTokens(matched: string[], total: number): number | null {
  if (total === 0) return null;
  const overlap = matched.length / total;
  return Math.min(overlap + Math.min(matched.length * 0.1, 0.3), 1.0);
}

// ---------------------------------------------------------------------------
// Profile value helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the profile has selected 'location' as a value,
 * checking both the plain `values` array and the `values_rated` array.
 */
export function profileHasLocationValue(
  values: string[] | null | undefined,
  valuesRated: RatedValue[] | null | undefined,
): boolean {
  const inValues = (values ?? []).some((v) => String(v).toLowerCase() === 'location');
  const inRated = (valuesRated ?? []).some(
    (v) => (typeof v === 'string' ? v : v?.value)?.toLowerCase() === 'location',
  );
  return inValues || inRated;
}

// ---------------------------------------------------------------------------
// Final score combiner
// ---------------------------------------------------------------------------

export interface ScoreComponents {
  valueScore: number | null;
  skillScore: number | null;
  workTypeScore: number | null;
  locationScore: number | null;
}

const WEIGHTS = { value: 0.55, skill: 0.35, work: 0.05, location: 0.05 } as const;

/**
 * Combine individual dimension scores into a single [0, 1] match score.
 *
 * Legacy path: when only value + skill scores are present (no work/location),
 * preserves the original 60/40 split to avoid changing existing match data.
 */
export function combineFinalScore({
  valueScore,
  skillScore,
  workTypeScore,
  locationScore,
}: ScoreComponents): number {
  const hasValue = valueScore != null;
  const hasSkill = skillScore != null;
  const hasWork = workTypeScore != null;
  const hasLocation = locationScore != null;

  // Legacy path: preserve original 60/40 split
  if (hasValue && hasSkill && !hasWork && !hasLocation) {
    return Math.min(valueScore! * 0.6 + skillScore! * 0.4, 1.0);
  }

  const numerator =
    (hasValue ? valueScore! * WEIGHTS.value : 0) +
    (hasSkill ? skillScore! * WEIGHTS.skill : 0) +
    (hasWork ? workTypeScore! * WEIGHTS.work : 0) +
    (hasLocation ? locationScore! * WEIGHTS.location : 0);

  const denom =
    (hasValue ? WEIGHTS.value : 0) +
    (hasSkill ? WEIGHTS.skill : 0) +
    (hasWork ? WEIGHTS.work : 0) +
    (hasLocation ? WEIGHTS.location : 0);

  return denom > 0 ? Math.min(numerator / denom, 1.0) : 0;
}
