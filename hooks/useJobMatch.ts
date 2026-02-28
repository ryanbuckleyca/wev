'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

interface JobMatch {
  score: number
  shared_values: string[]
}

export function useJobMatch(jobId: string) {
  const { user } = useAuth()
  const [match, setMatch] = useState<JobMatch | null>(null)
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
          .select('score, shared_values')
          .eq('user_id', user.id)
          .eq('job_id', jobId)
          .maybeSingle()

        if (error) {
          console.error('Error fetching job match:', error)
          setMatch(null)
        } else if (data) {
          setMatch({
            score: data.score,
            shared_values: data.shared_values || []
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

  return {
    match,
    loading,
    isValueMatched,
    matchPercentage: match ? Math.round(match.score * 100) : 0
  }
}
