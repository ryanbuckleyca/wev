import { getSupabaseServer } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { RatedValue, JobRatedValue, getRankWeight } from './value-ratings';
import { getDistance } from 'geolib';

// ─── Task 4.2: Constants ──────────────────────────────────────────────────────

const DISTANCE_THRESHOLDS = {
  COMMUTE_KM: 50,
  REGIONAL_KM: 150,
} as const;

const IMPRECISE_ACCURACY_TYPES = ['state', 'country'] as const;

const BASE_WEIGHTS = {
  values: 0.55,
  skills: 0.35,
  work_type: 0.05,
  location: 0.05,
} as const;

const LOCATION_PRIORITY_WEIGHT = 0.20;
const WORK_TYPE_PRIORITY_WEIGHT = 0.10;
const MIN_CORE_WEIGHT = 0.50;

// ─── Task 4.4: Types ──────────────────────────────────────────────────────────

export interface DimensionWeights {
  values: number;
  skills: number;
  work_type: number;
  location: number;
}

export interface DimensionScores {
  values: number | null;
  skills: number | null;
  work_type: number | null;
  location: number | null;
}

// ─── Task 4.3: computeLocationScore ──────────────────────────────────────────

/**
 * Pure function — no Supabase dependency.
 * Evaluates conditions in Boolean-first order and returns a tiered location score.
 */
export function computeLocationScore(
  jobLat: number | null,
  jobLng: number | null,
  userLat: number | null,
  userLng: number | null,
  jobAccuracyType: string | null,
  userWorkTypes: string[],
  jobWorkType: string | null,
  jobMunicipality: string | null,
  jobProvince: string | null,
  userMunicipality: string | null,
  userProvince: string | null,
): number | null {
  // 1. Remote-on-remote
  if (userWorkTypes.includes('remote') && jobWorkType === 'remote') {
    return 1.0;
  }

  // 2. Remote job, non-remote user
  if (jobWorkType === 'remote' && !userWorkTypes.includes('remote')) {
    return null;
  }

  // 3. Physical job, remote-only user
  if (
    jobWorkType !== 'remote' &&
    userWorkTypes.length > 0 &&
    userWorkTypes.every((wt) => wt === 'remote')
  ) {
    return null;
  }

  // 4. Exact municipality + province match (case-insensitive, both non-null)
  if (
    jobMunicipality != null &&
    jobProvince != null &&
    userMunicipality != null &&
    userProvince != null &&
    jobMunicipality.toLowerCase() === userMunicipality.toLowerCase() &&
    jobProvince.toLowerCase() === userProvince.toLowerCase()
  ) {
    return 1.0;
  }

  // 5. Imprecise geocode
  if (jobAccuracyType != null && (IMPRECISE_ACCURACY_TYPES as readonly string[]).includes(jobAccuracyType)) {
    return null;
  }

  // 6. Missing coordinates
  if (jobLat == null || jobLng == null || userLat == null || userLng == null) {
    return null;
  }

  // 7. Distance bands
  const distanceMetres = getDistance(
    { latitude: jobLat, longitude: jobLng },
    { latitude: userLat, longitude: userLng },
  );
  const distanceKm = distanceMetres / 1000;

  if (distanceKm <= DISTANCE_THRESHOLDS.COMMUTE_KM) return 1.0;
  if (distanceKm <= DISTANCE_THRESHOLDS.REGIONAL_KM) return 0.5;
  return 0.0;
}

// ─── Task 4.4: normalizeWeights ───────────────────────────────────────────────

/**
 * Pure function — no Supabase dependency.
 * - null score  → weight zeroed out (excluded, redistributed)
 * - 0.0 score   → weight retained (hard zero, pulls score down)
 * - Result weights sum to 1.0 across retained dimensions.
 * - If all weights sum to 0, returns all-zero weights.
 */
export function normalizeWeights(
  weights: DimensionWeights,
  scores: DimensionScores,
): DimensionWeights {
  const dims = ['values', 'skills', 'work_type', 'location'] as const;

  const adjusted: DimensionWeights = { values: 0, skills: 0, work_type: 0, location: 0 };

  for (const dim of dims) {
    adjusted[dim] = scores[dim] === null ? 0 : weights[dim];
  }

  const total = dims.reduce((sum, dim) => sum + adjusted[dim], 0);

  if (total === 0) {
    return { values: 0, skills: 0, work_type: 0, location: 0 };
  }

  return {
    values: adjusted.values / total,
    skills: adjusted.skills / total,
    work_type: adjusted.work_type / total,
    location: adjusted.location / total,
  };
}

// ─── Task 4.5: buildLocationWeights ──────────────────────────────────────────

function buildLocationWeights(hasLocationValue: boolean): { location: number; work_type: number } {
  if (hasLocationValue) {
    return { location: LOCATION_PRIORITY_WEIGHT, work_type: WORK_TYPE_PRIORITY_WEIGHT };
  }
  return { location: BASE_WEIGHTS.location, work_type: BASE_WEIGHTS.work_type };
}

interface MatchResult {
  user_id: string;
  job_id: string;
  score: number;
  value_score: number | null;
  skill_score: number | null;
  work_type_score: number | null;
  location_score: number | null;
  shared_values: string[];
  shared_skills: string[];
}

/** Non-null object with string `value` (RatedValue-shaped; tolerates raw JSON). */
function isRatedValueShape(v: unknown): v is RatedValue {
  return (
    v !== null &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    typeof (v as RatedValue).value === 'string'
  );
}

function userValueEntryToRated(v: unknown): RatedValue {
  if (typeof v === 'string') return { value: v };
  if (isRatedValueShape(v)) {
    const r = v.rank;
    return { value: v.value, rank: typeof r === 'number' ? r : undefined };
  }
  return { value: '' };
}

function userValueEntryToPlain(v: unknown): string {
  if (typeof v === 'string') return v;
  if (isRatedValueShape(v)) return v.value;
  return '';
}

/**
 * True when any element is RatedValue-shaped with `rank` set (scanned in full; order-safe).
 * Raw API / JSON can place strings before objects; we still take Weighted_Match when any rank exists.
 */
function shouldUseWeightedUserMatch(values: string[] | RatedValue[]): boolean {
  return (values as unknown[]).some((v) => isRatedValueShape(v) && v.rank != null);
}

/**
 * Build a map from value name → confidence weight for a job's rated values.
 * Returns null when the job has no rated values (all weights default to 1.0).
 *
 * Duplicate `value` strings in `jobValuesRated` use MIN(weight), matching SQL
 * `job_value_weights` (MIN(job_w) per job_id, val) and `job_confidence_weight`.
 */
function buildJobConfidenceMap(
  jobValuesRated?: JobRatedValue[] | null,
): Map<string, number> | null {
  if (!jobValuesRated?.length) return null;
  const total = jobValuesRated.length;
  const map = new Map<string, number>();
  for (const jv of jobValuesRated) {
    const w = getRankWeight(jv.confidence, total);
    const prev = map.get(jv.value);
    map.set(jv.value, prev === undefined ? w : Math.min(prev, w));
  }
  return map;
}

function getJobWeight(confidenceMap: Map<string, number> | null, value: string): number {
  if (!confidenceMap) return 1.0;
  return confidenceMap.get(value) ?? 1.0;
}

/**
 * Calculate match score between user profile and job.
 *
 * Job confidence weighting (applies to both paths when jobValuesRated is provided):
 *   For each shared value, the overlap contribution is scaled by the job's
 *   confidence weight: getRankWeight(confidence, job_total).
 *   When jobValuesRated is absent, all job weights default to 1.0 (backward compatible).
 *
 * Flat_Match (used when userValues is string[] OR all RatedValues have no rank):
 *   overlap = sum(job_weight for shared values) / user_values_count
 *   bonus   = min(shared_count * 0.1, 0.3)
 *   score   = min(overlap + bonus, 1.0)
 *
 * Weighted_Match (used when at least one RatedValue has a rank):
 *   user_w(rank)  = linear decay from 1.0 (rank 1) to MIN_WEIGHT (rank N)
 *   job_w(conf)   = linear decay from 1.0 (confidence 1) to MIN_WEIGHT (confidence M)
 *   weighted_overlap = sum(user_w * job_w for shared) / sum(user_w for all)
 *   bonus            = min(shared_count * 0.1, 0.3)
 *   score            = min(weighted_overlap + bonus, 1.0)
 *   Unranked user values use NEUTRAL_WEIGHT.
 */
export function calculateMatch(
  userValues: string[] | RatedValue[],
  jobValues: string[],
  jobValuesRated?: JobRatedValue[] | null,
): {
  score: number;
  shared_values: string[];
} {
  if (!userValues.length || !jobValues.length) {
    return { score: 0, shared_values: [] };
  }

  const jobSet = new Set(jobValues);
  const confidenceMap = buildJobConfidenceMap(jobValuesRated);

  // Weighted_Match path: at least one RatedValue has a rank
  if (shouldUseWeightedUserMatch(userValues)) {
    const rated = (userValues as unknown[]).map(userValueEntryToRated);
    const total = rated.length;
    const sharedValues: string[] = [];
    let weightedOverlapNumerator = 0;
    let weightedOverlapDenominator = 0;

    for (const rv of rated) {
      const w = getRankWeight(rv.rank, total);
      weightedOverlapDenominator += w;
      if (jobSet.has(rv.value)) {
        sharedValues.push(rv.value);
        weightedOverlapNumerator += w * getJobWeight(confidenceMap, rv.value);
      }
    }

    if (weightedOverlapDenominator === 0) {
      return { score: 0, shared_values: [] };
    }

    const overlap = weightedOverlapNumerator / weightedOverlapDenominator;
    const bonus = Math.min(sharedValues.length * 0.1, 0.3);
    const score = Math.min(overlap + bonus, 1.0);

    return { score, shared_values: sharedValues };
  }

  // Flat_Match path: plain string[] (or all-unrated RatedValue[]); per-element so order vs shape mismatches are safe
  const plainValues = (userValues as unknown[]).map(userValueEntryToPlain);

  const sharedValues = plainValues.filter((v) => jobSet.has(v));
  const overlapNumerator = sharedValues.reduce((sum, v) => sum + getJobWeight(confidenceMap, v), 0);
  const overlap = overlapNumerator / plainValues.length;
  const bonus = Math.min(sharedValues.length * 0.1, 0.3);
  const score = Math.min(overlap + bonus, 1.0);

  return { score, shared_values: sharedValues };
}

/**
 * Calculate matches for a single user against all jobs.
 * Uses the service Supabase client so reads/writes are not limited to the caller’s RLS scope.
 */
export async function calculateUserMatches(userId: string): Promise<void> {
  const supabase = getSupabaseServer();

  try {
    // Get user profile values
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('values, values_rated, skills, work_types, ideal_work_environment')
      .eq('id', userId)
      .single();

    const userValues: string[] | RatedValue[] = profile?.values_rated?.length
      ? (profile.values_rated as RatedValue[])
      : (profile?.values ?? []);

    if (profileError || !userValues.length) {
      return;
    }

    // Get all jobs with values
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('id, values, values_rated, skills, work_type, location, summary, description')
      .not('values', 'is', null);

    if (jobsError) {
      logger.error({ err: jobsError }, 'Error fetching jobs for matching');
      return;
    }

    // Calculate matches
    const matches: MatchResult[] = [];

    for (const job of jobs || []) {
      if (!job.values?.length && !job.skills?.length) continue;

      // Value score (existing logic)
      const vMatch = calculateMatch(
        userValues,
        job.values || [],
        job.values_rated as JobRatedValue[] | null,
      );
      const valueScore = typeof vMatch.score === 'number' ? vMatch.score : null;
      const sharedValues = vMatch.shared_values || [];

      // Skill score (flat overlap + bonus)
      const userSkills: string[] = (profile?.skills as string[]) || [];
      const jobSkills: string[] = job.skills || [];
      let skillScore: number | null = null;
      let sharedSkills: string[] = [];
      if (userSkills.length > 0 && jobSkills.length > 0) {
        sharedSkills = userSkills.filter((s) => jobSkills.includes(s));
        const sharedCount = sharedSkills.length;
        skillScore = Math.min(sharedCount / userSkills.length + Math.min(sharedCount * 0.1, 0.3), 1.0);
      }

      // Work type score: treat empty/missing profile.work_types as "all selected"
      // so users who haven't opted out still get the small work-type weight.
      const profileWorkTypes: string[] = (profile?.work_types as string[]) ?? [];
      let workTypeScore: number | null = null;
      if (!Array.isArray(profileWorkTypes) || profileWorkTypes.length === 0) {
        // Default: all work types are considered selected.
        workTypeScore = 1.0;
      } else {
        workTypeScore = job.work_type && profileWorkTypes.includes(job.work_type) ? 1.0 : 0.0;
      }

      // Location score: only when user selected 'location' as a value and provided ideal_work_environment
      let locationScore: number | null = null;
      const idealEnv = (profile as any)?.ideal_work_environment;
      const hasLocationValue = ((profile?.values as string[]) || []).some((v) => String(v).toLowerCase() === 'location') ||
        ((profile?.values_rated as any[]) || []).some((v) => (typeof v === 'string' ? v : v?.value)?.toLowerCase() === 'location');
      if (hasLocationValue && idealEnv && typeof idealEnv === 'string' && idealEnv.trim().length > 0) {
        const idealTokens = idealEnv
          .toLowerCase()
          .split(/[^\w]+/)
          .filter((s) => s.length > 2);
        const jobText = ((job.location || '') + ' ' + (job.summary || '') + ' ' + (job.description || '')).toLowerCase();
        if (idealTokens.length > 0) {
          const matched = idealTokens.filter((t) => jobText.includes(t));
          const overlap = matched.length / idealTokens.length;
          locationScore = Math.min(overlap + Math.min(matched.length * 0.1, 0.3), 1.0);
        }
      }

      // Combine into final score with fallbacks
      const hasValue = valueScore != null;
      const hasSkill = skillScore != null;
      const hasWork = workTypeScore != null;
      const hasLocation = locationScore != null;

      let finalScore = 0;
      if (hasValue && hasSkill && !hasWork && !hasLocation) {
        // Preserve legacy behavior when only values+skills present
        finalScore = Math.min(valueScore! * 0.6 + (skillScore ?? 0) * 0.4, 1.0);
      } else {
        // Base weights
        const w = { value: 0.55, skill: 0.35, work: 0.05, location: 0.05 };
        const numerator = (hasValue ? (valueScore ?? 0) * w.value : 0) +
          (hasSkill ? (skillScore ?? 0) * w.skill : 0) +
          (hasWork ? (workTypeScore ?? 0) * w.work : 0) +
          (hasLocation ? (locationScore ?? 0) * w.location : 0);
        const denom = (hasValue ? w.value : 0) + (hasSkill ? w.skill : 0) + (hasWork ? w.work : 0) + (hasLocation ? w.location : 0);
        finalScore = denom > 0 ? Math.min(numerator / denom, 1.0) : 0;
      }

      matches.push({
        user_id: userId,
        job_id: job.id,
        score: finalScore,
        value_score: valueScore,
        skill_score: skillScore,
        work_type_score: workTypeScore,
        location_score: locationScore,
        shared_values: sharedValues,
        shared_skills: sharedSkills,
      });
    }

    // Upsert matches to database
    if (matches.length > 0) {
      const { error: upsertError } = await supabase.from('job_matches').upsert(matches, {
        onConflict: 'user_id,job_id',
      });

      if (upsertError) {
        logger.error({ err: upsertError }, 'Error upserting matches (user batch)');
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Error calculating user matches');
  }
}

/**
 * Calculate matches for a single job against all users.
 * Uses the service Supabase client so reads/writes are not limited to the caller’s RLS scope.
 */
export async function calculateJobMatches(jobId: string): Promise<void> {
  const supabase = getSupabaseServer();

  try {
    // Get job values
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('values, values_rated, skills, work_type, location, summary, description')
      .eq('id', jobId)
      .single();

    if (jobError || !job?.values?.length) {
      return;
    }

    const jobValuesRated = job.values_rated as JobRatedValue[] | null;

    // Get all users with profile values
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, values, values_rated, skills, work_types, ideal_work_environment')
      .not('values', 'is', null);

    if (profilesError) {
      logger.error({ err: profilesError }, 'Error fetching profiles for matching');
      return;
    }

    // Calculate matches
    const matches: MatchResult[] = [];

    const jobSkills: string[] = job?.skills || [];
    const jobText = ((job?.location || '') + ' ' + (job?.summary || '') + ' ' + (job?.description || '')).toLowerCase();

    for (const profile of profiles || []) {
      if (!profile.values?.length && !profile.values_rated?.length && !profile.skills?.length) continue;

      const profileValues: string[] | RatedValue[] = profile.values_rated?.length
        ? (profile.values_rated as RatedValue[])
        : (profile.values ?? []);

      const vMatch = calculateMatch(profileValues, job.values || [], jobValuesRated);
      const valueScore = typeof vMatch.score === 'number' ? vMatch.score : null;
      const sharedValues = vMatch.shared_values || [];

      // Skill score
      const userSkills: string[] = profile?.skills || [];
      let skillScore: number | null = null;
      let sharedSkills: string[] = [];
      if (userSkills.length > 0 && jobSkills.length > 0) {
        sharedSkills = userSkills.filter((s) => jobSkills.includes(s));
        const sharedCount = sharedSkills.length;
        skillScore = Math.min(sharedCount / userSkills.length + Math.min(sharedCount * 0.1, 0.3), 1.0);
      }

      // Work type score: treat empty/missing profile.work_types as "all selected"
      const profileWorkTypes: string[] = (profile as any)?.work_types ?? [];
      let workTypeScore: number | null = null;
      if (!Array.isArray(profileWorkTypes) || profileWorkTypes.length === 0) {
        workTypeScore = 1.0;
      } else {
        workTypeScore = job?.work_type && profileWorkTypes.includes(job.work_type) ? 1.0 : 0.0;
      }

      // Location score
      let locationScore: number | null = null;
      const idealEnv = (profile as any)?.ideal_work_environment;
      const hasLocationValue = ((profile?.values as string[]) || []).some((v) => String(v).toLowerCase() === 'location') ||
        ((profile?.values_rated as any[]) || []).some((v) => (typeof v === 'string' ? v : v?.value)?.toLowerCase() === 'location');
      if (hasLocationValue && idealEnv && typeof idealEnv === 'string' && idealEnv.trim().length > 0) {
        const idealTokens = idealEnv
          .toLowerCase()
          .split(/[^\w]+/)
          .filter((s) => s.length > 2);
        if (idealTokens.length > 0) {
          const matched = idealTokens.filter((t) => jobText.includes(t));
          const overlap = matched.length / idealTokens.length;
          locationScore = Math.min(overlap + Math.min(matched.length * 0.1, 0.3), 1.0);
        }
      }

      const hasValue = valueScore != null;
      const hasSkill = skillScore != null;
      const hasWork = workTypeScore != null;
      const hasLocation = locationScore != null;

      let finalScore = 0;
      if (hasValue && hasSkill && !hasWork && !hasLocation) {
        finalScore = Math.min(valueScore! * 0.6 + (skillScore ?? 0) * 0.4, 1.0);
      } else {
        const w = { value: 0.55, skill: 0.35, work: 0.05, location: 0.05 };
        const numerator = (hasValue ? (valueScore ?? 0) * w.value : 0) +
          (hasSkill ? (skillScore ?? 0) * w.skill : 0) +
          (hasWork ? (workTypeScore ?? 0) * w.work : 0) +
          (hasLocation ? (locationScore ?? 0) * w.location : 0);
        const denom = (hasValue ? w.value : 0) + (hasSkill ? w.skill : 0) + (hasWork ? w.work : 0) + (hasLocation ? w.location : 0);
        finalScore = denom > 0 ? Math.min(numerator / denom, 1.0) : 0;
      }

      matches.push({
        user_id: profile.id,
        job_id: jobId,
        score: finalScore,
        value_score: valueScore,
        skill_score: skillScore,
        work_type_score: workTypeScore,
        location_score: locationScore,
        shared_values: sharedValues,
        shared_skills: sharedSkills,
      });
    }

    // Upsert matches to database
    if (matches.length > 0) {
      const { error: upsertError } = await supabase.from('job_matches').upsert(matches, {
        onConflict: 'user_id,job_id',
      });

      if (upsertError) {
        logger.error({ err: upsertError }, 'Error upserting matches (job batch)');
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Error calculating job matches');
  }
}
