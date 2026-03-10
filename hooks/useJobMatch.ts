'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { JobMatchData } from '@/lib/supabase'

export function useJobMatch(jobId: string) {
  const { user } = useAuth()
  const [match, setMatch] = useState<JobMatchData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setMatch(null)
      setLoading(false)
      return
    }

    const fetchMatch = async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('job_matches')
          .select('score, value_score, skill_score, shared_values, shared_skills')
          .eq('user_id', user.id)
          .eq('job_id', jobId)
          .maybeSingle()

        if (error) {
          console.error('Error fetching job match:', error)
          setMatch(null)
        } else if (data) {
          setMatch({
            score: data.score,
            value_score: data.value_score,
            skill_score: data.skill_score,
            shared_values: data.shared_values || [],
            shared_skills: data.shared_skills || [],
          })
        } else {
          // No match data found
          setMatch(null)
        }
      } catch (error) {
        console.error('Error fetching job match:', error)
        setMatch(null)
      } finally {
        setLoading(false)
      }
    }

    fetchMatch()
  }, [user, jobId])

  const isValueMatched = (value: string) => {
    return match?.shared_values?.includes(value) || false
  }

  const isSkillMatched = (skill: string) => {
    return match?.shared_skills?.includes(skill) || false
  }

  return {
    match,
    loading,
    isValueMatched,
    isSkillMatched,
    matchPercentage: match ? Math.round(match.score * 100) : 0
  }
}
