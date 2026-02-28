'use client'

import { useState, useEffect } from 'react'
import { JobPosting } from '@/lib/supabase'
import { Lineicons } from '@lineiconshq/react-lineicons'
import { Leaf1Solid, Leaf1Outlined, Bookmark1Solid, Bookmark1Outlined, ChevronDownSolid, ChevronUpSolid } from '@lineiconshq/free-icons'
import Pill from './Pill'
import Tooltip from './Tooltip'
import { getValueDefinition } from '@/lib/values'
import { useJobMatch } from '@/hooks/useJobMatch'
import { useAuth } from '@/contexts/AuthContext'
import MatchDonut from './MatchDonut'

interface JobCardProps {
  job: JobPosting
  isAdmin: boolean
  onSseToggle: (job: JobPosting) => void
  onBookmarkToggle?: (job: JobPosting, bookmarked: boolean) => void
  updatingId: string | null
  initialExpanded?: boolean
}

export default function JobCard({ 
  job, 
  isAdmin, 
  onSseToggle, 
  onBookmarkToggle,
  updatingId,
  initialExpanded = true
}: JobCardProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded)
  const [bookmarked, setBookmarked] = useState(false) // TODO: Connect to actual bookmark state
  
  // Get user state
  const { user } = useAuth()
  
  // Get match data for this job (only when user is logged in)
  const { match, loading, isValueMatched, matchPercentage } = useJobMatch(job.id)
  
  // Sync internal state with prop changes
  useEffect(() => {
    setIsExpanded(initialExpanded)
  }, [initialExpanded])
  
  const sse = !!job.is_sse
  
  const getCardSummary = (job: JobPosting) => {
    const title = job.job_title.length > 25 
      ? job.job_title.substring(0, 25) + '...' 
      : job.job_title
    const location = job.location || 'Remote'
  
    // Simple date formatting for header
    let date: Date
    if (
      typeof job.date_posted === 'string' &&
      !job.date_posted.endsWith('Z') &&
      !job.date_posted.match(/[+-]\d{2}:\d{2}$/)
    ) {
      date = new Date(job.date_posted + 'Z')
    } else {
      date = new Date(job.date_posted)
    }
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  
    return `${job.organization} - ${title} • ${location} • ${dateStr}`
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

  const handleBookmarkToggle = () => {
    const newBookmarkState = !bookmarked
    setBookmarked(newBookmarkState)
    onBookmarkToggle?.(job, newBookmarkState)
  }

  return (
    <div className="relative rounded-wev-card shadow-wev-card transition-all duration-300 bg-wev-surface border border-wev-border hover:shadow-wev-card-hover hover:border-wev-primary overflow-hidden">
      {/* Card Header */}
      <div className="flex items-center justify-between px-3 py-2 rounded-t-wev-card transition-all duration-300 border-b border-wev-border bg-wev-surface">
        {/* Left side: SSE + Summary */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            onClick={() => onSseToggle(job)}
            disabled={updatingId === job.id}
            className="wev-icon-btn disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            title={sse ? 'Remove SSE Status' : 'Mark as SSE'}
            aria-label={sse ? 'SSE job (click to unmark)' : 'Mark as SSE job'}
          >
            {sse ? (
              <Lineicons icon={Leaf1Solid} size={16} className="text-wev-success" />
            ) : (
              <Lineicons icon={Leaf1Outlined} size={16} className="text-wev-text-secondary" />
            )}
          </button>
          <span className="text-sm text-wev-text-secondary truncate pr-2">
            {getCardSummary(job)}
          </span>
        </div>
        
        {/* Right side: Bookmark + Collapse */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleBookmarkToggle}
            className="wev-icon-btn"
            title={bookmarked ? 'Remove bookmark' : 'Bookmark job'}
            aria-label={bookmarked ? 'Bookmarked (click to remove)' : 'Bookmark job'}
          >
            {bookmarked ? (
              <Lineicons icon={Bookmark1Solid} size={16} className="text-wev-info" />
            ) : (
              <Lineicons icon={Bookmark1Outlined} size={16} className="text-wev-text-secondary" />
            )}
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="wev-icon-btn"
            title={isExpanded ? 'Collapse' : 'Expand'}
            aria-label={isExpanded ? 'Collapse job details' : 'Expand job details'}
          >
            {isExpanded ? (
              <Lineicons icon={ChevronUpSolid} size={18} className="text-wev-text-secondary" />
            ) : (
              <Lineicons icon={ChevronDownSolid} size={18} className="text-wev-text-secondary" />
            )}
          </button>
        </div>
      </div>

      {/* Card Content */}
      {isExpanded && (
        <div className="py-4 px-5 bg-wev-surface">
          <div className="job-details">
            <div className="job-detail-line">
              <span className="job-label">Who: </span>
              <span className="job-value">{job.organization}</span>
              <br />
            </div>
            <div className="job-detail-line">
              <span className="job-label">What: </span>
              {job.listing_url ? (
                <a
                  href={job.listing_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="job-link"
                >
                  {job.job_title}
                </a>
              ) : (
                <span className="job-value">{job.job_title}</span>
              )}
              <br />
            </div>
            <div className="job-detail-line">
              <span className="job-label">Where: </span>
              <span className="job-value">{job.location || 'N/A'}</span>
              <br />
            </div>
            {job.summary && (
              <div className="job-detail-line">
                <span className="job-label">Why: </span>
                <span className="job-value">{job.summary}</span>
                <br />
              </div>
            )}
            <div className="job-detail-line">
              <span className="job-label">When: </span>
              <span className="job-value">Posted {formatDate(job.date_posted)}</span>
              <br />
            </div>
            <div className="job-detail-line">
              <span className="job-label">How much: </span>
              <span className="job-value">{job.wage || 'N/A'}</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Values Section */}
      {job.values && job.values.length > 0 && (
        <div className={`px-4 py-3 bg-wev-surface-tint ${isExpanded ? 'border-t border-wev-border' : ''}`}>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Match Score - only show when user is logged in */}
            {user && !loading && (
              <div className="flex items-center gap-1">
                <MatchDonut 
                  percentage={matchPercentage} 
                  size="sm"
                />
                <span className="text-sm text-wev-text-secondary font-medium">
                  {matchPercentage}% match:
                </span>
              </div>
            )}
            
            {/* Values pills */}
            {job.values.map((value) => (
              <Tooltip
                key={value}
                content={
                  `<p class="font-medium text-wev-primary-text mb-1">${value}</p>
                   <p class="text-xs text-wev-text-primary mb-2">${getValueDefinition(value).description}</p>
                   <p class="text-xs text-wev-text-secondary italic">${getValueDefinition(value).example}</p>`
                }
              >
                <Pill 
                  variant={user ? (isValueMatched(value) ? 'primary' : 'secondary') : 'default'} 
                  size="sm"
                >
                  {value}
                </Pill>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
