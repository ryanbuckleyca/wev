'use client'

import { JobPosting } from '@/lib/supabase'

interface JobListingsProps {
  jobs: JobPosting[]
  loading: boolean
  error: string | null
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

export default function JobListings({ jobs, loading, error }: JobListingsProps) {
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-wev-lavender"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-wev-teagreen/50 border border-wev-lilac rounded-lg p-4 text-black">
        <p className="font-semibold">Error loading job postings</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="bg-white border border-wev-ash rounded-lg p-8 text-center">
        <p className="text-black">No job postings found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {jobs.map((job) => (
        <div
          key={job.id}
          className="bg-white border border-wev-ash rounded-lg p-6 shadow-sm hover:shadow-md hover:border-wev-lilac transition-all"
        >
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
      ))}
    </div>
  )
}
