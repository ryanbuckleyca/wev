"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import JobListings from '@/components/JobListings'
import { createClient } from '@/lib/supabase/client'
import { useRequireAuth } from '@/lib/hooks/useRequireAuth'
import LoadingState from '@/components/LoadingState'
import PageLayout from '@/components/PageLayout'

export default function BookmarksPage() {
  const { user, loading } = useRequireAuth()
  const [jobs, setJobs] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return

    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/bookmarks', { cache: 'no-store' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Failed to fetch bookmarked jobs')
        }

        const { jobs: bookmarkedJobs } = await res.json()
        if (mounted) setJobs(bookmarkedJobs)
      } catch (err) {
        console.error('Failed to load bookmarks:', err)
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      }
    })()

    return () => {
      mounted = false
    }
  }, [user])

  if (loading) return <LoadingState />

  if (!user) {
    return null
  }

  return (
    <PageLayout>
      <div>
        <h1 className="text-2xl font-semibold mb-2">My Bookmarks</h1>

        {error && (
          <div className="bg-wev-alert-tint border border-wev-alert rounded-wev-card p-4 text-wev-alert-text mb-4">
            <p className="font-semibold">Error</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {jobs === null ? (
          <LoadingState />
        ) : jobs.length === 0 ? (
          <div className="bg-wev-surface border border-wev-border rounded-wev-card p-8 text-center">
            <p className="text-wev-text-primary">No bookmarked jobs yet.</p>
          </div>
        ) : (
          <JobListings jobs={jobs} loading={false} error={null} />
        )}
      </div>
    </PageLayout>
  )
}

