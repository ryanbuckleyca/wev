"use client"

import { useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import JobListings from '@/components/JobListings'
import { createClient } from '@/lib/supabase/client'
import { useRequireAuth } from '@/lib/hooks/useRequireAuth'
import LoadingState from '@/components/LoadingState'
import PageLayout from '@/components/PageLayout'
import type { JobMatchData } from '@/lib/supabase'

export default function BookmarksPage() {
  const t = useTranslations()
  const locale = useLocale()
  const { user, loading } = useRequireAuth()
  const [jobs, setJobs] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [matchData, setMatchData] = useState<Map<string, JobMatchData>>(new Map())

  useEffect(() => {
    if (!user) return

    let mounted = true
    ;(async () => {
      try {
        const res = await fetch(`/api/bookmarks?locale=${locale}`, { cache: 'no-store' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || t('bookmarks.loadFailed'))
        }

        const { jobs: bookmarkedJobs } = await res.json()
        if (!mounted) return

        setJobs(bookmarkedJobs)

        // Batch-fetch match data for bookmarked jobs
        if (bookmarkedJobs?.length > 0) {
          const supabase = createClient()
          const { data: matches, error: matchError } = await supabase
            .from('job_matches')
            .select('job_id, score, value_score, skill_score, shared_values, shared_skills')
            .eq('user_id', user.id)
            .in('job_id', bookmarkedJobs.map((j: { id: string }) => j.id))

          if (!matchError && mounted) {
            const matchMap = new Map<string, JobMatchData>()
            matches?.forEach((m: { job_id: string; score: number; value_score?: number | null; skill_score?: number | null; shared_values: string[]; shared_skills?: string[] }) => {
              matchMap.set(m.job_id, {
                score: m.score,
                value_score: m.value_score,
                skill_score: m.skill_score,
                shared_values: m.shared_values || [],
                shared_skills: m.shared_skills || [],
              })
            })
            setMatchData(matchMap)
          }
        }
      } catch (err) {
        console.error('Failed to load bookmarks:', err)
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      }
    })()

    return () => {
      mounted = false
    }
  }, [user])

  if (loading) return <LoadingState message={t('common.loading')} />

  if (!user) {
    return null
  }

  return (
    <PageLayout>
      <div>
        <h1 className="text-2xl font-semibold mb-2">{t('bookmarks.title')}</h1>

        {error && (
          <div className="bg-wev-destructive-tint border border-destructive rounded-wev-card p-4 text-destructive-foreground mb-4">
            <p className="font-semibold">{t('bookmarks.error')}</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {jobs === null ? (
          <LoadingState message={t('common.loading')} />
        ) : jobs.length === 0 ? (
          <div className="bg-card border border-border rounded-wev-card p-8 text-center">
            <p className="text-foreground">{t('bookmarks.noBookmarks')}</p>
          </div>
        ) : (
          <JobListings
            jobs={jobs}
            loading={false}
            error={null}
            matchData={matchData}
            bookmarkedJobIds={new Set(jobs.map((j: { id: string }) => j.id))}
            onJobBookmarkChange={(job, bookmarked) => {
              if (!bookmarked) setJobs((prev) => (prev ?? []).filter((j) => j.id !== job.id))
            }}
          />
        )}
      </div>
    </PageLayout>
  )
}

