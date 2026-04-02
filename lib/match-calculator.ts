import { supabaseServer } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { RatedValue, JobRatedValue, getRankWeight } from './value-ratings';
import { getDistance } from 'geolib';

// Constants

const DISTANCE_THRESHOLDS = {
  COMMUTE_KM: 50,
  REGIONAL_KM: 150,
} as const;

const IMPRECISE_ACCURACY_TYPES = new Set(['state', 'country']);

const BASE_WEIGHTS = {
  values: 0.55,
  skills: 0.35,
  work_type: 0.05,
  location: 0.05,
} as const;

// When the user has ranked Location as a value, boost location + work_type weights.
// These two must sum to less than 1.0; the remainder is split between values/skills
// at the same ratio as BASE_WEIGHTS.
const LOCATION_PRIORITY_WEIGHTS = {
  location: 0.20,
  work_type: 0.10,
} as const;

// Types

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

export interface LocationScoreParams {
  jobLat: number | null;
  jobLng: number | null;
  userLat: number | null;
  userLng: number | null;
  jobAccuracyType: string | null;
  userWorkTypes: string[];
  jobWorkType: string | null;
  jobMunicipality: string | null;
  jobProvince: string | null;
  userMunicipality: string | null;
  userProvince: string | null;
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

// Typed shapes for Supabase query results -- avoids `as any` casts downstream.
interface ProfileRow {
  id: string;
  values: string[] | null;
  values_rated: unknown[] | null;
  skills: string[] | null;
  work_types: string[] | null;
  lat: number | null;
  lng: number | null;
  municipality: string | null;
  province: string | null;
}

interface JobRow {
  id: string;
  values: string[] | null;
  values_rated: unknown[] | null;
  skills: string[] | null;
  work_type: string | null;
  lat: number | null;
  lng: number | null;
  geocode_accuracy_type: string | null;
  municipality: string | null;
  province: string | null;
}

// computeLocationScore

/** Lowercase and strip diacritics for accent-insensitive municipality comparison. */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
}

/**
 * Pure function -- no Supabase dependency.
 * Evaluates conditions in Boolean-first order and returns a tiered location score.
 *
 * Returns null when the score cannot be determined (missing data or incompatible work types).
 * Returns 0.0 when the user is physically out of range.
 */
export function computeLocationScore(params: LocationScoreParams): number | null {
  const {
    jobLat, jobLng, userLat, userLng,
    jobAccuracyType,
    userWorkTypes, jobWorkType,
    jobMunicipality, jobProvince,
    userMunicipality, userProvince,
  } = params;

  const userIncludesRemote = userWorkTypes.includes('remote');
  const jobIsRemote = jobWorkType === 'remote';
  const jobIsHybrid = jobWorkType === 'hybrid';
  const userIsRemoteOnly = userWorkTypes.length > 0 && userWorkTypes.every((wt) => wt === 'remote');

  // 1. Remote-on-remote
  if (userIncludesRemote && jobIsRemote) return 1.0;

  // 2. Remote job, non-remote user
  if (jobIsRemote && !userIncludesRemote) return null;

  // 3. Physical or hybrid job, remote-only user
  if (jobWorkType !== 'remote' && userIsRemoteOnly) return null;

  // 4. Hybrid job: user must include hybrid or office to proceed to distance check
  if (jobIsHybrid && !userWorkTypes.includes('hybrid') && !userWorkTypes.includes('office')) {
    return null;
  }

  // 5. Exact municipality + province match (case and accent-insensitive, all four non-null)
  if (
    jobMunicipality != null && jobProvince != null &&
    userMunicipality != null && userProvince != null &&
    normalize(jobMunicipality) === normalize(userMunicipality) &&
    jobProvince.toLowerCase() === userProvince.toLowerCase()
  ) {
    return 1.0;
  }

  // 6. Imprecise geocode -- can't trust coordinates
  if (jobAccuracyType != null && IMPRECISE_ACCURACY_TYPES.has(jobAccuracyType)) return null;

  // 7. Missing coordinates
  if (jobLat == null || jobLng == null || userLat == null || userLng == null) return null;

  // 8. Distance bands
  const distanceKm = getDistance(
    { latitude: jobLat, longitude: jobLng },
    { latitude: userLat, longitude: userLng },
  ) / 1000;

  if (distanceKm <= DISTANCE_THRESHOLDS.COMMUTE_KM) return 1.0;
  if (distanceKm <= DISTANCE_THRESHOLDS.REGIONAL_KM) return 0.5;
  return 0.0;
}

// normalizeWeights

/**
 * Pure function -- no Supabase dependency.
 * - null score  -> weight zeroed out (excluded, redistributed to remaining dimensions)
 * - 0.0 score   -> weight retained (hard zero, pulls final score down)
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
  if (total === 0) return adjusted;

  for (const dim of dims) {
    adjusted[dim] /= total;
  }
  return adjusted;
}

// buildDimensionWeights

/**
 * Returns the base dimension weights, boosting location and work_type when the
 * user has ranked Location as a value. The remaining weight is split between
 * values and skills at the same ratio as BASE_WEIGHTS.
 */
function buildDimensionWeights(userHasLocationValue: boolean): DimensionWeights {
  if (userHasLocationValue) {
    const remaining = 1 - LOCATION_PRIORITY_WEIGHTS.location - LOCATION_PRIORITY_WEIGHTS.work_type;
    const valueRatio = BASE_WEIGHTS.values / (BASE_WEIGHTS.values + BASE_WEIGHTS.skills);
    return {
      values: remaining * valueRatio,
      skills: remaining * (1 - valueRatio),
      work_type: LOCATION_PRIORITY_WEIGHTS.work_type,
      location: LOCATION_PRIORITY_WEIGHTS.location,
    };
  }
  return { ...BASE_WEIGHTS };
}

// calculateMatch

/** Non-null object with string value (RatedValue-shaped; tolerates raw JSON). */
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
 * True when any element is RatedValue-shaped with rank set.
 * Raw API / JSON can place strings before objects; we still take Weighted_Match when any rank exists.
 */
function shouldUseWeightedUserMatch(values: string[] | RatedValue[]): boolean {
  return (values as unknown[]).some((v) => isRatedValueShape(v) && v.rank != null);
}

/**
 * Build a map from value name to confidence weight for a job's rated values.
 * Returns null when the job has no rated values (all weights default to 1.0).
 *
 * Duplicate value strings use MIN(weight), matching SQL job_value_weights.
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
  return confidenceMap?.get(value) ?? 1.0;
}

function calcWeightedMatch(
  userValues: string[] | RatedValue[],
  jobSet: Set<string>,
  confidenceMap: Map<string, number> | null,
): { score: number | null; shared_values: string[] } {
  const rated = (userValues as unknown[]).map(userValueEntryToRated);
  const sharedValues: string[] = [];
  let numerator = 0;
  let denominator = 0;

  for (const rv of rated) {
    const w = getRankWeight(rv.rank, rated.length);
    denominator += w;
    if (jobSet.has(rv.value)) {
      sharedValues.push(rv.value);
      numerator += w * getJobWeight(confidenceMap, rv.value);
    }
  }

  if (denominator === 0) return { score: null, shared_values: [] };

  const score = Math.min(numerator / denominator + Math.min(sharedValues.length * 0.1, 0.3), 1.0);
  return { score, shared_values: sharedValues };
}

function calcFlatMatch(
  userValues: string[] | RatedValue[],
  jobSet: Set<string>,
  confidenceMap: Map<string, number> | null,
): { score: number | null; shared_values: string[] } {
  const plainValues = (userValues as unknown[]).map(userValueEntryToPlain);
  const sharedValues = plainValues.filter((v) => jobSet.has(v));
  const overlap = sharedValues.reduce((sum, v) => sum + getJobWeight(confidenceMap, v), 0) / plainValues.length;
  const score = Math.min(overlap + Math.min(sharedValues.length * 0.1, 0.3), 1.0);
  return { score, shared_values: sharedValues };
}

/**
 * Calculate match score between user values and job values.
 *
 * Flat_Match (string[] or all-unranked RatedValue[]):
 *   overlap = sum(job_weight for shared) / user_count
 *   bonus   = min(shared_count * 0.1, 0.3)
 *   score   = min(overlap + bonus, 1.0)
 *
 * Weighted_Match (at least one RatedValue has a rank):
 *   user_w  = linear decay from 1.0 (rank 1) to MIN_WEIGHT (rank N)
 *   job_w   = linear decay from 1.0 (confidence 1) to MIN_WEIGHT (confidence M)
 *   score   = min(sum(user_w * job_w for shared) / sum(user_w) + bonus, 1.0)
 */
export function calculateMatch(
  userValues: string[] | RatedValue[],
  jobValues: string[],
  jobValuesRated?: JobRatedValue[] | null,
): { score: number | null; shared_values: string[] } {
  if (!userValues.length || !jobValues.length) {
    return { score: null, shared_values: [] };
  }

  const jobSet = new Set(jobValues);
  const confidenceMap = buildJobConfidenceMap(jobValuesRated);

  return shouldUseWeightedUserMatch(userValues)
    ? calcWeightedMatch(userValues, jobSet, confidenceMap)
    : calcFlatMatch(userValues, jobSet, confidenceMap);
}

// Score calculation helpers

function calcSkillScore(
  userSkills: string[],
  jobSkills: string[],
): { score: number | null; shared: string[] } {
  if (userSkills.length === 0 || jobSkills.length === 0) return { score: null, shared: [] };
  const jobSkillSet = new Set(jobSkills);
  const shared = userSkills.filter((s) => jobSkillSet.has(s));
  const score = Math.min(shared.length / userSkills.length + Math.min(shared.length * 0.1, 0.3), 1.0);
  return { score, shared };
}

/**
 * Returns null (excluded from weighted average) when jobWorkType is null -- a job
 * with no work type set should not penalise the match score.
 * Returns 1.0 when the profile has no preference (empty work_types).
 */
function calcWorkTypeScore(profileWorkTypes: string[], jobWorkType: string | null): number | null {
  if (jobWorkType == null) return null;
  if (profileWorkTypes.length === 0) return 1.0;
  return profileWorkTypes.includes(jobWorkType) ? 1.0 : 0.0;
}

function calcFinalScore(scores: DimensionScores, weights: DimensionWeights): number {
  const dims = ['values', 'skills', 'work_type', 'location'] as const;
  const normalized = normalizeWeights(weights, scores);
  return Math.min(
    dims.reduce((sum, dim) => {
      const s = scores[dim];
      return sum + (s != null ? s * normalized[dim] : 0);
    }, 0),
    1.0,
  );
}

function resolveUserValues(profile: Pick<ProfileRow, 'values' | 'values_rated'>): string[] | RatedValue[] {
  return profile.values_rated?.length
    ? (profile.values_rated as RatedValue[])
    : (profile.values ?? []);
}

function profileHasLocationValue(profile: Pick<ProfileRow, 'values' | 'values_rated'>): boolean {
  const isLocation = (v: unknown) =>
    (typeof v === 'string' ? v : (v as RatedValue)?.value)?.toLowerCase() === 'location';
  return resolveUserValues(profile).some(isLocation);
}

// computeMatchForPair

/**
 * Computes all dimension scores and the final weighted score for a single
 * profile-job pair. Extracted to eliminate duplication between calculateUserMatches
 * and calculateJobMatches.
 */
function computeMatchForPair(
  profile: ProfileRow,
  job: JobRow,
): Omit<MatchResult, 'user_id' | 'job_id'> {
  const profileValues = resolveUserValues(profile);
  const profileWorkTypes = profile.work_types ?? [];

  const vMatch = calculateMatch(profileValues, job.values ?? [], job.values_rated as JobRatedValue[] | null);
  const { score: skillScore, shared: sharedSkills } = calcSkillScore(
    profile.skills ?? [],
    job.skills ?? [],
  );
  const workTypeScore = calcWorkTypeScore(profileWorkTypes, job.work_type);
  const locationScore = computeLocationScore({
    jobLat: job.lat,
    jobLng: job.lng,
    userLat: profile.lat,
    userLng: profile.lng,
    jobAccuracyType: job.geocode_accuracy_type,
    userWorkTypes: profileWorkTypes,
    jobWorkType: job.work_type,
    jobMunicipality: job.municipality,
    jobProvince: job.province,
    userMunicipality: profile.municipality,
    userProvince: profile.province,
  });

  const scores: DimensionScores = {
    values: vMatch.score,
    skills: skillScore,
    work_type: workTypeScore,
    location: locationScore,
  };

  return {
    score: calcFinalScore(scores, buildDimensionWeights(profileHasLocationValue(profile))),
    value_score: scores.values,
    skill_score: scores.skills,
    work_type_score: scores.work_type,
    location_score: scores.location,
    shared_values: vMatch.shared_values,
    shared_skills: sharedSkills,
  };
}

// Select field lists — single source of truth for both query functions
const PROFILE_SELECT = 'id, values, values_rated, skills, work_types, lat, lng, municipality, province' as const;
const JOB_SELECT = 'id, values, values_rated, skills, work_type, lat, lng, geocode_accuracy_type, municipality, province' as const;

// calculateUserMatches

/**
 * Calculate matches for a single user against all jobs.
 * Uses the service Supabase client so reads/writes bypass RLS.
 */
export async function calculateUserMatches(userId: string): Promise<void> {
  try {
    const { data: profile, error: profileError } = await supabaseServer
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', userId)
      .single();

    if (profileError || !profile) return;

    const hasValues = resolveUserValues(profile as ProfileRow).length > 0;
    const hasSkills = (profile.skills?.length ?? 0) > 0;
    if (!hasValues && !hasSkills) {
      logger.debug({ userId }, 'Skipping match calculation: user has no values or skills');
      return;
    }

    const { data: jobs, error: jobsError } = await supabaseServer
      .from('jobs')
      .select(JOB_SELECT)
      .or('values.not.is.null,values_rated.not.is.null,skills.not.is.null');

    if (jobsError) {
      logger.error({ err: jobsError }, 'Error fetching jobs for matching');
      return;
    }

    const matches: MatchResult[] = (jobs ?? []).map((job) => ({
        user_id: userId,
        job_id: job.id,
        ...computeMatchForPair(profile as ProfileRow, job as JobRow),
      }));

    if (matches.length > 0) {
      const { error: upsertError } = await supabaseServer
        .from('job_matches')
        .upsert(matches, { onConflict: 'user_id,job_id' });
      if (upsertError) logger.error({ err: upsertError }, 'Error upserting matches (user batch)');
    }
  } catch (error) {
    logger.error({ err: error }, 'Error calculating user matches');
  }
}

// calculateJobMatches

/**
 * Calculate matches for a single job against all users.
 * Uses the service Supabase client so reads/writes bypass RLS.
 */
export async function calculateJobMatches(jobId: string): Promise<void> {
  try {
    const { data: job, error: jobError } = await supabaseServer
      .from('jobs')
      .select(JOB_SELECT)
      .eq('id', jobId)
      .single();

    if (jobError || !job) return;
    if (!job.values?.length && !job.values_rated?.length && !job.skills?.length) return;

    const { data: profiles, error: profilesError } = await supabaseServer
      .from('profiles')
      .select(PROFILE_SELECT)
      .or('values.not.is.null,values_rated.not.is.null,skills.not.is.null');

    if (profilesError) {
      logger.error({ err: profilesError }, 'Error fetching profiles for matching');
      return;
    }

    const matches: MatchResult[] = (profiles ?? []).map((profile) => ({
        user_id: profile.id,
        job_id: jobId,
        ...computeMatchForPair(profile as ProfileRow, job as JobRow),
      }));

    if (matches.length > 0) {
      const { error: upsertError } = await supabaseServer
        .from('job_matches')
        .upsert(matches, { onConflict: 'user_id,job_id' });
      if (upsertError) logger.error({ err: upsertError }, 'Error upserting matches (job batch)');
    }
  } catch (error) {
    logger.error({ err: error }, 'Error calculating job matches');
  }
}
