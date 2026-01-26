'use client'

import { JobPosting } from '@/lib/supabase'

interface JobListingsProps {
  jobs: JobPosting[]
  loading: boolean
  error: string | null
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
        <p className="font-semibold">Error loading job postings</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
        <p className="text-gray-600">No job postings found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {jobs.map((job) => (
        <div
          key={job.id}
          className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="space-y-3">
            <div>
              <span className="font-semibold text-gray-700">What: </span>
              {job.listing_url ? (
                <a
                  href={job.listing_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {job.job_title}
                </a>
              ) : (
                <span className="text-gray-900">{job.job_title}</span>
              )}
            </div>
            <div>
              <span className="font-semibold text-gray-700">Who: </span>
              <span className="text-gray-900">{job.organization}</span>
            </div>
            <div>
              <span className="font-semibold text-gray-700">Where: </span>
              <span className="text-gray-900">{job.location}</span>
            </div>
            <div>
              <span className="font-semibold text-gray-700">When: </span>
              <span className="text-gray-900">
                Posted {formatDate(job.date_posted)}
              </span>
            </div>
            <div>
              <span className="font-semibold text-gray-700">Deadline: </span>
              <span className="text-gray-900">
                {job.close_date ? formatDate(job.close_date) : 'N/A'}
              </span>
            </div>
            <div>
              <span className="font-semibold text-gray-700">How much: </span>
              <span className="text-gray-900">{job.wage || 'N/A'}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
