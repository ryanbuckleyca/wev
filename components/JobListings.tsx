'use client'

import { useState } from 'react'
import { JobPosting } from '@/lib/supabase'
import JobCard from './JobCard'
import { useAuth } from '@/contexts/AuthContext'
import LoadingIndicator from './LoadingIndicator'

interface JobListingsProps {
  jobs: JobPosting[]
  loading: boolean
  error: string | null
  onJobSseChange?: (jobId: string, isSse: boolean) => void
  onJobBookmarkChange?: (job: JobPosting, bookmarked: boolean) => void
  allExpanded?: boolean
}

export default function JobListings({ jobs, loading, error, onJobSseChange, onJobBookmarkChange, allExpanded = true }: JobListingsProps) {
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
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York',
    })
  }

  if (loading) {
    return <LoadingIndicator fullScreen={false} message="Loading jobs..." />
  }

  if (error) {
    return (
      <div className="bg-wev-alert-tint border border-wev-alert rounded-wev-card p-4 text-wev-alert-text">
        <p className="font-semibold">Error loading job postings</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="bg-wev-surface border border-wev-border rounded-wev-card p-8 text-center">
        <p className="text-wev-text-primary">No job postings found.</p>
      </div>
    )
  }

  const isAdmin = role === 'admin'

  return (
    <div className="space-y-4">
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          isAdmin={isAdmin}
          onSseToggle={handleSseToggle}
          onBookmarkToggle={onJobBookmarkChange}
          updatingId={updatingId}
          initialExpanded={allExpanded}
        />
      ))}
    </div>
  )
}
