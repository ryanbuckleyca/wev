'use client'

import { useState } from 'react'
import { JobPosting } from '@/lib/supabase'
import { Lineicons } from '@lineiconshq/react-lineicons'
import { Leaf1Outlined, Leaf1Solid } from '@lineiconshq/free-icons'

interface JobListingsProps {
  jobs: JobPosting[]
  loading: boolean
  error: string | null
  onJobSseChange?: (jobId: string, isSse: boolean) => void
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

export default function JobListings({ jobs, loading, error, onJobSseChange }: JobListingsProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null)

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

  const isSse = (job: JobPosting) => !!job.is_sse

  return (
    <div className="space-y-6">
      {jobs.map((job) => {
        const sse = isSse(job)
        const sseButtonClass =
          'absolute right-0 top-1/2 h-10 w-10 -translate-y-1/2 translate-x-1/2 flex items-center justify-center rounded-full border border-wev-border shadow-wev-card transition-colors disabled:cursor-not-allowed disabled:bg-wev-surface disabled:shadow-none z-10 overflow-hidden [&_svg]:pointer-events-none ' +
          (sse
            ? 'bg-wev-surface text-wev-success hover:bg-wev-success-tint/40 hover:border-wev-success/50'
            : 'bg-wev-bg text-wev-text-tertiary hover:bg-wev-primary-tint/20 hover:text-wev-text-secondary hover:border-wev-border')

        return (
          <div
            key={job.id}
            className={
              sse
                ? 'relative rounded-wev-card p-6 pr-14 shadow-wev-card transition-all duration-300 bg-wev-surface border border-wev-border hover:shadow-wev-card-hover hover:border-wev-primary'
                : 'relative rounded-wev-card p-6 pr-14 shadow-wev-card transition-all duration-300 bg-wev-success-tint/40 border-2 border-wev-success/50 opacity-70 hover:border-wev-success/70'
            }
          >
            {(onJobSseChange != null || sse) && (
              <>
                {onJobSseChange != null && (
                  <button
                    type="button"
                    onClick={() => handleSseToggle(job)}
                    disabled={updatingId === job.id}
                    title={sse ? 'Mark as not SSE' : 'Mark as SSE'}
                    className={sseButtonClass}
                    aria-label={sse ? 'SSE job (click to unmark)' : 'Mark as SSE job'}
                  >
                    {updatingId === job.id ? (
                      <span className="text-sm text-wev-text-tertiary">...</span>
                    ) : (
                      <span className="relative flex items-center justify-center">
                        <Lineicons icon={sse ? Leaf1Solid : Leaf1Outlined} size={22} className="flex shrink-0" />
                        {!sse && (
                          <span className="pointer-events-none absolute left-1/2 top-1/2 h-px w-10 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-wev-text-tertiary" />
                        )}
                      </span>
                    )}
                  </button>
                )}
                {updatingId !== job.id && (
                  <span
                    className={
                      sse
                        ? 'pointer-events-none absolute right-0 top-1/2 mt-4 translate-x-1/2 rounded-wev-pill bg-wev-success-tint text-wev-success-text px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap shadow-wev-btn'
                        : 'pointer-events-none absolute right-0 top-1/2 mt-4 translate-x-1/2 rounded-wev-pill bg-wev-bg text-wev-text-tertiary px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap shadow-wev-btn border border-wev-border'
                    }
                  >
                    {sse ? '✓ SSE' : '× SSE'}
                  </span>
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
