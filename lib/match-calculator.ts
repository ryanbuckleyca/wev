import { createClient } from '@/lib/supabase/client'
import { RatedValue, getRankWeight, NEUTRAL_WEIGHT } from './value-ratings'

interface UserProfile {
  id: string
  values: string[]
  values_rated?: RatedValue[] | null
}

interface Job {
  id: string
  values: string[]
}

interface MatchResult {
  user_id: string
  job_id: string
  score: number
  shared_values: string[]
}

/**
 * Returns true when the array contains at least one RatedValue with a rank set.
 * Used to decide between Flat_Match and Weighted_Match.
 */
function isRatedValueArray(values: string[] | RatedValue[]): values is RatedValue[] {
  return (
    values.length > 0 &&
    typeof values[0] === 'object' &&
    (values as unknown as RatedValue[]).some(v => v.rank != null)
  )
}

/**
 * Calculate match score between user profile and job.
 *
 * Flat_Match (used when userValues is string[] OR all RatedValues have no rank):
 *   overlap = shared_count / user_values_count
 *   bonus   = min(shared_count * 0.1, 0.3)
 *   score   = min(overlap + bonus, 1.0)
 *
 * Weighted_Match (used when at least one RatedValue has a rank):
 *   weight(rank) = linear decay from 1.0 (rank 1) to MIN_WEIGHT (rank N)
 *   weighted_overlap = sum(weight for shared values) / sum(weight for all user values)
 *   bonus            = min(shared_count * 0.1, 0.3)
 *   score            = min(weighted_overlap + bonus, 1.0)
 *   Unranked values use NEUTRAL_WEIGHT.
 */
export function calculateMatch(userValues: string[] | RatedValue[], jobValues: string[]): {
  score: number
  shared_values: string[]
} {
  if (!userValues.length || !jobValues.length) {
    return { score: 0, shared_values: [] }
  }

  const jobSet = new Set(jobValues)

  // Weighted_Match path: at least one RatedValue has a rank
  if (isRatedValueArray(userValues)) {
    const rated = userValues as RatedValue[]
    const total = rated.length
    const sharedValues: string[] = []
    let weightedOverlapNumerator = 0
    let weightedOverlapDenominator = 0

    for (const rv of rated) {
      const w = getRankWeight(rv.rank, total)
      weightedOverlapDenominator += w
      if (jobSet.has(rv.value)) {
        sharedValues.push(rv.value)
        weightedOverlapNumerator += w
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

  // Flat_Match path: plain string[] (or all-unrated RatedValue[] treated as strings)
  const isObjectArray = userValues.length > 0 && typeof userValues[0] === 'object'
  const plainValues = isObjectArray
    ? (userValues as unknown as RatedValue[]).map(rv => rv.value)
    : (userValues as unknown as string[])

  const sharedValues = plainValues.filter(v => jobSet.has(v))
  const overlap = sharedValues.length / plainValues.length
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
      console.log('No profile values found for user:', userId)
      return
    }

    // Get all jobs with values
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('id, values')
      .not('values', 'is', null)

    if (jobsError) {
      console.error('Error fetching jobs for matching:', jobsError)
      return
    }

    // Calculate matches
    const matches: MatchResult[] = []
    
    for (const job of jobs || []) {
      if (!job.values?.length) continue
      
      const match = calculateMatch(userValues, job.values)
      
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
      } else {
        console.log(`Updated ${matches.length} matches for user ${userId}`)
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
      .select('values')
      .eq('id', jobId)
      .single()

    if (jobError || !job?.values?.length) {
      console.log('No job values found for job:', jobId)
      return
    }

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

      const match = calculateMatch(profileValues, job.values)
      
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
      } else {
        console.log(`Updated ${matches.length} matches for job ${jobId}`)
      }
    }
  } catch (error) {
    console.error('Error calculating job matches:', error)
  }
}
