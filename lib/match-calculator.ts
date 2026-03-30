import { getSupabaseServer } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { RatedValue, JobRatedValue, getRankWeight } from './value-ratings';

interface MatchResult {
  user_id: string;
  job_id: string;
  score: number;
  shared_values: string[];
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
