'use client'

import { useState } from 'react'
import { JobPosting } from '@/lib/supabase'
import { Lineicons } from '@lineiconshq/react-lineicons'
import { Briefcase2Outlined, Briefcase2Solid } from '@lineiconshq/free-icons'

interface JobListingsProps {
  jobs: JobPosting[]
  loading: boolean
  error: string | null
  onJobCorporateChange?: (jobId: string, isCorporate: boolean) => void
}

// Reusable component for job detail lines
function JobDetailLine({
  label,
  value,
  valueAsLink,
}: {
  label: string
  value: string | React.ReactNode
  valueAsLink?: { href: string; text: string }
}) {
  return (
    <>
      <span className="job-label">{label}: </span>
      {valueAsLink ? (
        <a
          href={valueAsLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className="job-link"
        >
          {valueAsLink.text}
        </a>
      ) : (
        <span className="job-value">{value}</span>
      )}
      <br />
    </>
  )
}

export default function JobListings({ jobs, loading, error, onJobCorporateChange }: JobListingsProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const handleCorporateToggle = async (job: JobPosting) => {
    const newValue = !job.is_corporate
    setUpdatingId(job.id)
    try {
      const res = await fetch(`/api/bulletin/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_corporate: newValue }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to update')
      }
      onJobCorporateChange?.(job.id, newValue)
    } catch (err) {
      console.error('Failed to update is_corporate:', err)
    } finally {
      setUpdatingId(null)
    }
  }
  const formatDate = (dateString: string): string => {
    // Parse date string - if it doesn't have timezone, treat as UTC
    let date: Date
    if (typeof dateString === 'string' && !dateString.endsWith('Z') && !dateString.match(/[+-]\d{2}:\d{2}$/)) {
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
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-wev-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-wev-alert-tint border border-wev-alert rounded-wev-card p-4 text-wev-alert-text shadow-wev-card">
        <p className="font-semibold">Error loading job postings</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="bg-wev-surface border border-wev-border rounded-wev-card p-8 text-center shadow-wev-card">
        <p className="text-wev-text-primary">No job postings found.</p>
      </div>
    )
  }

  const isCorporate = (job: JobPosting) => !!job.is_corporate

  return (
    <div className="space-y-6">
      {jobs.map((job) => {
        const corporate = isCorporate(job)
        return (
          <div
            key={job.id}
            className={
              corporate
                ? 'relative rounded-wev-card p-6 pr-14 shadow-wev-card transition-all duration-300 bg-wev-primary-tint/30 border-2 border-wev-primary/50 opacity-75 hover:border-wev-primary/70'
                : 'relative rounded-wev-card p-6 pr-14 shadow-wev-card transition-all duration-300 bg-wev-surface border border-wev-border hover:shadow-wev-card-hover hover:border-wev-primary'
            }
          >
            {(onJobCorporateChange != null || corporate) && (
              <>
                {corporate && (
                  <span
                    className="float-right ml-4 rounded-wev-pill bg-wev-warn-tint text-wev-warn-text px-3 py-1 text-xs font-semibold whitespace-nowrap"
                    aria-hidden
                  >
                    Corporate
                  </span>
                )}
                {onJobCorporateChange != null && (
                  <button
                    type="button"
                    onClick={() => handleCorporateToggle(job)}
                    disabled={updatingId === job.id}
                    title={corporate ? 'Mark as not corporate' : 'Mark as corporate'}
                    className="absolute right-0 top-1/2 h-10 w-10 -translate-y-1/2 translate-x-1/2 flex items-center justify-center rounded-full border border-wev-border bg-wev-surface text-wev-warn-text shadow-wev-card hover:bg-wev-primary-tint/20 hover:text-wev-warn hover:border-wev-primary/50 transition-colors disabled:cursor-not-allowed disabled:bg-wev-surface disabled:shadow-none z-10 [&_svg]:pointer-events-none"
                    aria-label={corporate ? 'Corporate gig (click to unmark)' : 'Mark as corporate gig'}
                  >
                    {updatingId === job.id ? (
                      <span className="text-sm text-wev-text-warn">…</span>
                    ) : (
                      <Lineicons icon={corporate ? Briefcase2Solid : Briefcase2Outlined} size={22} className="flex shrink-0" />
                    )}
                  </button>
                )}
              </>
            )}
            <p className="job-details">
              <JobDetailLine label="Who" value={job.organization} />
              <JobDetailLine
                label="What"
                value={job.job_title}
                valueAsLink={job.listing_url ? { href: job.listing_url, text: job.job_title } : undefined}
              />
              <JobDetailLine label="Where" value={job.location || 'N/A'} />
              {job.summary && <JobDetailLine label="Why" value={job.summary} />}
              <JobDetailLine label="When" value={`Posted ${formatDate(job.date_posted)}`} />
              <JobDetailLine label="How much" value={job.wage || 'N/A'} />
            </p>
          </div>
        )
      })}
    </div>
  )
}
