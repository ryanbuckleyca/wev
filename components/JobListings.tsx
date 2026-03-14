'use client'

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { JobPosting, JobMatchData } from '@/lib/supabase'
import JobCard from './JobCard'
import { useAuth } from '@/contexts/AuthContext'
import LoadingIndicator from './LoadingIndicator'
import Button from './Button'

interface JobListingsProps {
  jobs: JobPosting[]
  loading: boolean
  error: string | null
  onJobSseChange?: (jobId: string, isSse: boolean) => void
  onJobBookmarkChange?: (job: JobPosting, bookmarked: boolean) => void
  allExpanded?: boolean
  matchData?: Map<string, JobMatchData>
  bookmarkedJobIds?: Set<string>
  selectedWorkTypes?: string[]
}

export default function JobListings({ jobs, loading, error, onJobSseChange, onJobBookmarkChange, allExpanded = true, matchData, bookmarkedJobIds, selectedWorkTypes }: JobListingsProps) {
  const t = useTranslations()
  const locale = useLocale()
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const { role } = useAuth()

  const handleSseToggle = async (job: JobPosting) => {
    const newValue = !job.is_sse
    setUpdatingId(job.id)
    try {
      const res = await fetch(`/api/bulletin/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_sse: newValue }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to update')
      }
      onJobSseChange?.(job.id, newValue)
    } catch (err) {
      console.error('Failed to update is_sse:', err)
    } finally {
      setUpdatingId(null)
    }
  }

  const formatDate = (dateString: string): string => {
    // Parse date string - if it doesn't have timezone, treat as UTC
    let date: Date
    if (
      typeof dateString === 'string' &&
      !dateString.endsWith('Z') &&
      !dateString.match(/[+-]\d{2}:\d{2}$/)
    ) {
      date = new Date(dateString + 'Z')
    } else {
      date = new Date(dateString)
    }
    // Map locale to appropriate locale string for toLocaleDateString
    const localeMap: Record<string, string> = {
      en: 'en-CA',
      fr: 'fr-CA',
    }
    const dateLocale = localeMap[locale] || 'en-CA'
    return date.toLocaleDateString(dateLocale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York',
    })
  }

  if (error) {
    return (
      <div className="bg-wev-destructive-tint border border-destructive rounded-wev-card p-4 text-destructive-foreground">
        <p className="font-semibold">{t('jobListings.error')}</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  if (loading && jobs.length === 0) {
    return <LoadingIndicator fullScreen={false} message={t('jobListings.loading')} />
  }

  if (!loading && jobs.length === 0) {
    return (
      <div className="bg-card border border-border rounded-wev-card p-8 text-center">
        <p className="text-foreground">{t('jobListings.noJobs')}</p>
      </div>
    )
  }

  const isAdmin = role === 'admin'

  return (
    <div className="space-y-4">
      {loading && jobs.length > 0 && (
        <div className="flex items-center justify-center py-4">
          <LoadingIndicator fullScreen={false} message={t('jobListings.loading')} />
        </div>
      )}

      <div className="space-y-6">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            isAdmin={isAdmin}
            onSseToggle={handleSseToggle}
            onBookmarkToggle={onJobBookmarkChange}
            updatingId={updatingId}
            initialExpanded={allExpanded}
            match={matchData?.get(job.id)}
            initialBookmarked={bookmarkedJobIds?.has(job.id) ?? false}
            selectedWorkTypes={selectedWorkTypes}
          />
        ))}
      </div>
    </div>
  )
}
