import { createClient } from '@/lib/supabase/client'
import { RatedValue, JobRatedValue, getRankWeight } from './value-ratings'

interface MatchResult {
  user_id: string
  job_id: string
  score: number
  shared_values: string[]
}

/** Non-null object with string `value` (RatedValue-shaped; tolerates raw JSON). */
function isRatedValueShape(v: unknown): v is RatedValue {
  return (
    v !== null &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    typeof (v as RatedValue).value === 'string'
  )
}

function userValueEntryToRated(v: unknown): RatedValue {
  if (typeof v === 'string') return { value: v }
  if (isRatedValueShape(v)) {
    const r = v.rank
    return { value: v.value, rank: typeof r === 'number' ? r : undefined }
  }
  return { value: '' }
}

function userValueEntryToPlain(v: unknown): string {
  if (typeof v === 'string') return v
  if (isRatedValueShape(v)) return v.value
  return ''
}

/**
 * True when any element is RatedValue-shaped with `rank` set (scanned in full; order-safe).
 * Raw API / JSON can place strings before objects; we still take Weighted_Match when any rank exists.
 */
function shouldUseWeightedUserMatch(values: string[] | RatedValue[]): boolean {
  return (values as unknown[]).some(v => isRatedValueShape(v) && v.rank != null)
}

/**
 * Build a map from value name → confidence weight for a job's rated values.
 * Returns null when the job has no rated values (all weights default to 1.0).
 *
 * Duplicate `value` strings in `jobValuesRated` use MIN(weight), matching SQL
 * `job_value_weights` (MIN(job_w) per job_id, val) and `job_confidence_weight`.
 */
function buildJobConfidenceMap(jobValuesRated?: JobRatedValue[] | null): Map<string, number> | null {
  if (!jobValuesRated?.length) return null
  const total = jobValuesRated.length
  const map = new Map<string, number>()
  for (const jv of jobValuesRated) {
    const w = getRankWeight(jv.confidence, total)
    const prev = map.get(jv.value)
    map.set(jv.value, prev === undefined ? w : Math.min(prev, w))
  }
  return map
}

function getJobWeight(confidenceMap: Map<string, number> | null, value: string): number {
  if (!confidenceMap) return 1.0
  return confidenceMap.get(value) ?? 1.0
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
  score: number
  shared_values: string[]
} {
  if (!userValues.length || !jobValues.length) {
    return { score: 0, shared_values: [] }
  }

  const jobSet = new Set(jobValues)
  const confidenceMap = buildJobConfidenceMap(jobValuesRated)

  // Weighted_Match path: at least one RatedValue has a rank
  if (shouldUseWeightedUserMatch(userValues)) {
    const rated = (userValues as unknown[]).map(userValueEntryToRated)
    const total = rated.length
    const sharedValues: string[] = []
    let weightedOverlapNumerator = 0
    let weightedOverlapDenominator = 0

    for (const rv of rated) {
      const w = getRankWeight(rv.rank, total)
      weightedOverlapDenominator += w
      if (jobSet.has(rv.value)) {
        sharedValues.push(rv.value)
        weightedOverlapNumerator += w * getJobWeight(confidenceMap, rv.value)
      }
    }

    if (weightedOverlapDenominator === 0) {
      return { score: 0, shared_values: [] }
    }

    const overlap = weightedOverlapNumerator / weightedOverlapDenominator
    const bonus = Math.min(sharedValues.length * 0.1, 0.3)
    const score = Math.min(overlap + bonus, 1.0)

    return { score, shared_values: sharedValues }
  }

  // Flat_Match path: plain string[] (or all-unrated RatedValue[]); per-element so order vs shape mismatches are safe
  const plainValues = (userValues as unknown[]).map(userValueEntryToPlain)

  const sharedValues = plainValues.filter(v => jobSet.has(v))
  const overlapNumerator = sharedValues.reduce(
    (sum, v) => sum + getJobWeight(confidenceMap, v), 0
  )
  const overlap = overlapNumerator / plainValues.length
  const bonus = Math.min(sharedValues.length * 0.1, 0.3)
  const score = Math.min(overlap + bonus, 1.0)

  return { score, shared_values: sharedValues }
}

/**
 * Calculate matches for a single user against all jobs
 */
export async function calculateUserMatches(userId: string): Promise<void> {
  const supabase = createClient()

  try {
    // Get user profile values
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('values, values_rated')
      .eq('id', userId)
      .single()

    const userValues: string[] | RatedValue[] =
      profile?.values_rated?.length
        ? (profile.values_rated as RatedValue[])
        : (profile?.values ?? [])

    if (profileError || !userValues.length) {
      return
    }

    // Get all jobs with values
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('id, values, values_rated')
      .not('values', 'is', null)

    if (jobsError) {
      console.error('Error fetching jobs for matching:', jobsError)
      return
    }

    // Calculate matches
    const matches: MatchResult[] = []
    
    for (const job of jobs || []) {
      if (!job.values?.length) continue
      
      const match = calculateMatch(
        userValues,
        job.values,
        job.values_rated as JobRatedValue[] | null,
      )
      
      matches.push({
        user_id: userId,
        job_id: job.id,
        score: match.score,
        shared_values: match.shared_values
      })
    }

    // Upsert matches to database
    if (matches.length > 0) {
      const { error: upsertError } = await supabase
        .from('job_matches')
        .upsert(matches, {
          onConflict: 'user_id,job_id'
        })

      if (upsertError) {
        console.error('Error upserting matches:', upsertError)
      }
    }
  } catch (error) {
    console.error('Error calculating user matches:', error)
  }
}

/**
 * Calculate matches for a single job against all users
 */
export async function calculateJobMatches(jobId: string): Promise<void> {
  const supabase = createClient()

  try {
    // Get job values
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('values, values_rated')
      .eq('id', jobId)
      .single()

    if (jobError || !job?.values?.length) {
      return
    }

    const jobValuesRated = job.values_rated as JobRatedValue[] | null

    // Get all users with profile values
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, values, values_rated')
      .not('values', 'is', null)

    if (profilesError) {
      console.error('Error fetching profiles for matching:', profilesError)
      return
    }

    // Calculate matches
    const matches: MatchResult[] = []
    
    for (const profile of profiles || []) {
      if (!profile.values?.length && !profile.values_rated?.length) continue
      
      const profileValues: string[] | RatedValue[] =
        profile.values_rated?.length
          ? (profile.values_rated as RatedValue[])
          : (profile.values ?? [])

      const match = calculateMatch(profileValues, job.values, jobValuesRated)
      
      matches.push({
        user_id: profile.id,
        job_id: jobId,
        score: match.score,
        shared_values: match.shared_values
      })
    }

    // Upsert matches to database
    if (matches.length > 0) {
      const { error: upsertError } = await supabase
        .from('job_matches')
        .upsert(matches, {
          onConflict: 'user_id,job_id'
        })

      if (upsertError) {
        console.error('Error upserting matches:', upsertError)
      }
    }
  } catch (error) {
    console.error('Error calculating job matches:', error)
  }
}
