import { createClient } from '@/lib/supabase/client'

interface UserProfile {
  id: string
  values: string[]
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
 * Calculate match score between user profile and job.
 * Formula (matches PL/pgSQL implementation in 20260305_optimize_match_triggers.sql;
 * legacy definition in 20260304_match_triggers.sql):
 *   overlap = shared_count / user_values_count
 *   bonus   = min(shared_count * 0.1, 0.3)
 *   score   = min(overlap + bonus, 1.0)
 */
export function calculateMatch(userValues: string[], jobValues: string[]): {
  score: number
  shared_values: string[]
} {
  if (!userValues.length || !jobValues.length) {
    return { score: 0, shared_values: [] }
  }

  const jobSet = new Set(jobValues)
  const sharedValues = userValues.filter(v => jobSet.has(v))
  const overlap = sharedValues.length / userValues.length
  const bonus = Math.min(sharedValues.length * 0.1, 0.3)
  const score = Math.min(overlap + bonus, 1.0)

  return {
    score,
    shared_values: sharedValues
  }
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
      .select('values')
      .eq('id', userId)
      .single()

    if (profileError || !profile?.values?.length) {
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
      
      const match = calculateMatch(profile.values, job.values)
      
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
      .select('id, values')
      .not('values', 'is', null)

    if (profilesError) {
      console.error('Error fetching profiles for matching:', profilesError)
      return
    }

    // Calculate matches
    const matches: MatchResult[] = []
    
    for (const profile of profiles || []) {
      if (!profile.values?.length) continue
      
      const match = calculateMatch(profile.values, job.values)
      
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
