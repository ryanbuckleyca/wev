import { getSupabaseServer } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { RatedValue, JobRatedValue, getRankWeight } from './value-ratings';
import {
  buildJobLocationText,
  combineFinalScore,
  computeLocationTokens,
  profileHasLocationValue,
  scoreLocationTokens,
  tokeniseIdealEnv,
} from './match-utils';

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

// ---------------------------------------------------------------------------
// Type guards / coercions for raw DB values
// ---------------------------------------------------------------------------

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
 * True when any element is RatedValue-shaped with `rank` set.
 * Raw API / JSON can place strings before objects; we still take Weighted_Match when any rank exists.
 */
function shouldUseWeightedUserMatch(values: string[] | RatedValue[]): boolean {
  return (values as unknown[]).some((v) => isRatedValueShape(v) && v.rank != null);
}

/**
 * Build a map from value name → confidence weight for a job's rated values.
 * Returns null when the job has no rated values (all weights default to 1.0).
 *
 * Duplicate `value` strings use MIN(weight), matching SQL `job_value_weights`.
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

// ---------------------------------------------------------------------------
// Core value-match calculation (exported for use in tests / other modules)
// ---------------------------------------------------------------------------

/**
 * Calculate match score between user profile values and job values.
 *
 * Flat_Match (string[] or all-unranked RatedValues):
 *   overlap = sum(job_weight for shared) / user_count
 *   bonus   = min(shared_count * 0.1, 0.3)
 *   score   = min(overlap + bonus, 1.0)
 *
 * Weighted_Match (at least one RatedValue has a rank):
 *   weighted_overlap = sum(user_w * job_w for shared) / sum(user_w for all)
 *   bonus            = min(shared_count * 0.1, 0.3)
 *   score            = min(weighted_overlap + bonus, 1.0)
 */
export function calculateMatch(
  userValues: string[] | RatedValue[],
  jobValues: string[],
  jobValuesRated?: JobRatedValue[] | null,
): { score: number; shared_values: string[] } {
  if (!userValues.length || !jobValues.length) {
    return { score: 0, shared_values: [] };
  }

  const jobSet = new Set(jobValues);
  const confidenceMap = buildJobConfidenceMap(jobValuesRated);

  if (shouldUseWeightedUserMatch(userValues)) {
    const rated = (userValues as unknown[]).map(userValueEntryToRated);
    const total = rated.length;
    const sharedValues: string[] = [];
    let numerator = 0;
    let denominator = 0;

    for (const rv of rated) {
      const w = getRankWeight(rv.rank, total);
      denominator += w;
      if (jobSet.has(rv.value)) {
        sharedValues.push(rv.value);
        numerator += w * getJobWeight(confidenceMap, rv.value);
      }
    }

    if (denominator === 0) return { score: 0, shared_values: [] };

    const overlap = numerator / denominator;
    const bonus = Math.min(sharedValues.length * 0.1, 0.3);
    return { score: Math.min(overlap + bonus, 1.0), shared_values: sharedValues };
  }

  // Flat_Match path
  const plainValues = (userValues as unknown[]).map(userValueEntryToPlain);
  const sharedValues = plainValues.filter((v) => jobSet.has(v));
  const overlapNumerator = sharedValues.reduce(
    (sum, v) => sum + getJobWeight(confidenceMap, v),
    0,
  );
  const overlap = overlapNumerator / plainValues.length;
  const bonus = Math.min(sharedValues.length * 0.1, 0.3);
  return { score: Math.min(overlap + bonus, 1.0), shared_values: sharedValues };
}

// ---------------------------------------------------------------------------
// Per-profile score calculation (shared between user-batch and job-batch)
// ---------------------------------------------------------------------------

interface ProfileLike {
  values?: string[] | null;
  values_rated?: RatedValue[] | null;
  skills?: string[] | null;
  work_types?: string[] | null;
  ideal_work_environment?: string | null;
}

interface JobLike {
  values?: string[] | null;
  values_rated?: JobRatedValue[] | null;
  skills?: string[] | null;
  work_type?: string | null;
  location?: string | null;
  summary?: string | null;
  description?: string | null;
}

function calculateProfileJobScores(
  profile: ProfileLike,
  job: JobLike,
  jobText: string,
): Omit<MatchResult, 'user_id' | 'job_id'> {
  const profileValues: string[] | RatedValue[] = profile.values_rated?.length
    ? (profile.values_rated as RatedValue[])
    : (profile.values ?? []);

  // Value score
  const vMatch = calculateMatch(
    profileValues,
    job.values ?? [],
    job.values_rated as JobRatedValue[] | null,
  );
  const valueScore: number | null = typeof vMatch.score === 'number' ? vMatch.score : null;
  const sharedValues = vMatch.shared_values ?? [];

  // Skill score
  const userSkills: string[] = profile.skills ?? [];
  const jobSkills: string[] = job.skills ?? [];
  let skillScore: number | null = null;
  let sharedSkills: string[] = [];
  if (userSkills.length > 0 && jobSkills.length > 0) {
    sharedSkills = userSkills.filter((s) => jobSkills.includes(s));
    const sharedCount = sharedSkills.length;
    skillScore = Math.min(
      sharedCount / userSkills.length + Math.min(sharedCount * 0.1, 0.3),
      1.0,
    );
  }

  // Work type score: empty profile.work_types → treat as "all selected"
  const profileWorkTypes: string[] = profile.work_types ?? [];
  let workTypeScore: number | null = null;
  if (profileWorkTypes.length === 0) {
    workTypeScore = 1.0;
  } else {
    workTypeScore = job.work_type && profileWorkTypes.includes(job.work_type) ? 1.0 : 0.0;
  }

  // Location score
  let locationScore: number | null = null;
  const idealEnv = profile.ideal_work_environment;
  if (
    profileHasLocationValue(profile.values, profile.values_rated) &&
    idealEnv &&
    idealEnv.trim().length > 0
  ) {
    const tokens = tokeniseIdealEnv(idealEnv);
    if (tokens.length > 0) {
      const { matched } = computeLocationTokens(idealEnv, jobText);
      locationScore = scoreLocationTokens(matched, tokens.length);
    }
  }

  const score = combineFinalScore({ valueScore, skillScore, workTypeScore, locationScore });

  return { score, value_score: valueScore, skill_score: skillScore, work_type_score: workTypeScore, location_score: locationScore, shared_values: sharedValues, shared_skills: sharedSkills };
}

// ---------------------------------------------------------------------------
// Public batch-calculation functions
// ---------------------------------------------------------------------------

/**
 * Calculate matches for a single user against all jobs.
 * Uses the service Supabase client so reads/writes bypass RLS.
 */
export async function calculateUserMatches(userId: string): Promise<void> {
  const supabase = getSupabaseServer();

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('values, values_rated, skills, work_types, ideal_work_environment')
      .eq('id', userId)
      .single();

    if (profileError || !profile) return;

    const userValues: string[] | RatedValue[] = profile.values_rated?.length
      ? (profile.values_rated as RatedValue[])
      : (profile.values ?? []);

    if (!userValues.length) return;

    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('id, values, values_rated, skills, work_type, location, summary, description')
      .not('values', 'is', null);

    if (jobsError) {
      logger.error({ err: jobsError }, 'Error fetching jobs for matching');
      return;
    }

    const matches: MatchResult[] = (jobs ?? [])
      .filter((job) => job.values?.length || job.skills?.length)
      .map((job) => {
        const jobText = buildJobLocationText(job.location, job.summary, job.description);
        const scores = calculateProfileJobScores(profile, job, jobText);
        return { user_id: userId, job_id: job.id, ...scores };
      });

    if (matches.length > 0) {
      const { error: upsertError } = await supabase
        .from('job_matches')
        .upsert(matches, { onConflict: 'user_id,job_id' });
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
 * Uses the service Supabase client so reads/writes bypass RLS.
 */
export async function calculateJobMatches(jobId: string): Promise<void> {
  const supabase = getSupabaseServer();

  try {
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('values, values_rated, skills, work_type, location, summary, description')
      .eq('id', jobId)
      .single();

    if (jobError || !job?.values?.length) return;

    const jobText = buildJobLocationText(job.location, job.summary, job.description);

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, values, values_rated, skills, work_types, ideal_work_environment')
      .not('values', 'is', null);

    if (profilesError) {
      logger.error({ err: profilesError }, 'Error fetching profiles for matching');
      return;
    }

    const matches: MatchResult[] = (profiles ?? [])
      .filter((p) => p.values?.length || p.values_rated?.length || p.skills?.length)
      .map((profile) => {
        const scores = calculateProfileJobScores(profile, job, jobText);
        return { user_id: profile.id, job_id: jobId, ...scores };
      });

    if (matches.length > 0) {
      const { error: upsertError } = await supabase
        .from('job_matches')
        .upsert(matches, { onConflict: 'user_id,job_id' });
      if (upsertError) {
        logger.error({ err: upsertError }, 'Error upserting matches (job batch)');
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Error calculating job matches');
  }
}
