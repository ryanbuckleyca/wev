'use client'

import { useState, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { JobPosting } from '@/lib/supabase'
import { Lineicons } from '@lineiconshq/react-lineicons'
import { Leaf1Solid, Leaf1Outlined, Bookmark1Solid, Bookmark1Outlined, ChevronDownSolid, ChevronUpSolid } from '@lineiconshq/free-icons'
import Pill from './Pill'
import Tooltip from './Tooltip'
import { getValueDefinition } from '@/lib/values'
import { useAuth } from '@/contexts/AuthContext'
import ProgressDonut from './ProgressDonut'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from '@/i18n/navigation'
import Collapsible from './Collapsible'

interface JobCardProps {
  job: JobPosting
  isAdmin: boolean
  onSseToggle: (job: JobPosting) => void
  onBookmarkToggle?: (job: JobPosting, bookmarked: boolean) => void
  updatingId: string | null
  initialExpanded?: boolean
  match?: { score: number; shared_values: string[] } | null
  initialBookmarked?: boolean
}

export default function JobCard({ 
  job, 
  isAdmin, 
  onSseToggle, 
  onBookmarkToggle,
  updatingId,
  initialExpanded = true,
  match: matchProp,
  initialBookmarked = false,
}: JobCardProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded)
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [bookmarkLoading, setBookmarkLoading] = useState(false)

  // Get user state
  const t = useTranslations()
  const locale = useLocale()
  const { user } = useAuth()
  const router = useRouter()

  // Use passed-in match data (batch-fetched by parent)
  const matchPercentage = matchProp ? Math.round(matchProp.score * 100) : 0
  const isValueMatched = (value: string) => matchProp?.shared_values?.includes(value) ?? false
  
  // Sync internal state with prop changes
  useEffect(() => {
    setIsExpanded(initialExpanded)
  }, [initialExpanded])

  useEffect(() => {
    setBookmarked(initialBookmarked)
  }, [initialBookmarked])
  
  const sse = !!job.is_sse
  
  const getCardSummary = (job: JobPosting) => {
    const title = job.job_title.length > 25 
      ? job.job_title.substring(0, 25) + '...' 
      : job.job_title
    const location = job.location || t('jobCard.remote')
  
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
    const dateStr = date.toLocaleDateString(locale, {
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
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York',
    })
  }

  const handleBookmarkToggle = () => {
    if (!user) {
      router.push('/login')
      return
    }

    const newBookmarkState = !bookmarked
    // Optimistic UI
    setBookmarked(newBookmarkState)
    onBookmarkToggle?.(job, newBookmarkState)

    ;(async () => {
      setBookmarkLoading(true)
      const supabase = createClient()
      try {
        if (newBookmarkState) {
          const { error } = await supabase.from('bookmarks').insert([{ user_id: user.id, job_id: job.id }])
          if (error) throw error
        } else {
          const { error } = await supabase.from('bookmarks').delete().eq('user_id', user.id).eq('job_id', job.id)
          if (error) throw error
        }
      } catch (err) {
        console.error('Bookmark update failed:', err)
        // rollback
        setBookmarked(!newBookmarkState)
        onBookmarkToggle?.(job, !newBookmarkState)
      } finally {
        setBookmarkLoading(false)
      }
    })()
  }

  return (
    <div className="relative rounded-wev-card transition-all duration-300 bg-wev-surface border border-wev-border hover:border-wev-primary overflow-hidden">
      {/* Card Header */}
      <div className="flex items-center justify-between px-3 py-2 rounded-t-wev-card transition-all duration-300 border-b border-wev-border bg-wev-surface">
        {/* Left side: SSE + Summary */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isAdmin ? (
            <button
              onClick={() => {
                const msg = sse
                  ? t('jobCard.removeSseConfirm', { title: job.job_title, org: job.organization })
                  : t('jobCard.markSseConfirm', { title: job.job_title, org: job.organization })
                if (window.confirm(msg)) onSseToggle(job)
              }}
              disabled={updatingId === job.id}
              className="wev-icon-btn disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              title={sse ? t('jobCard.removeSse') : t('jobCard.markSse')}
              aria-label={sse ? t('jobCard.sseJob') : t('jobCard.markSseJob')}
            >
              {sse ? (
                <Lineicons icon={Leaf1Solid} size={16} className="text-wev-success" />
              ) : (
                <Lineicons icon={Leaf1Outlined} size={16} className="text-wev-text-secondary" />
              )}
            </button>
          ) : sse ? (
            <span className="flex-shrink-0" aria-label={t('jobCard.sseJobLabel')}>
              <Lineicons icon={Leaf1Solid} size={16} className="text-wev-success" />
            </span>
          ) : null}
          <span className="text-sm text-wev-text-secondary truncate pr-2">
            {getCardSummary(job)}
          </span>
        </div>
        
        {/* Right side: Bookmark + Collapse */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleBookmarkToggle}
            className="wev-icon-btn"
            title={bookmarked ? t('jobCard.removeBookmark') : t('jobCard.bookmarkJob')}
            aria-label={bookmarked ? t('jobCard.bookmarked') : t('jobCard.bookmarkJobLabel')}
            disabled={bookmarkLoading}
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
            title={isExpanded ? t('jobCard.collapse') : t('jobCard.expand')}
            aria-label={isExpanded ? t('jobCard.collapseDetails') : t('jobCard.expandDetails')}
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
      <Collapsible isOpen={isExpanded}>
        <div className="py-4 px-5 bg-wev-surface">
          <div className="job-details">
            <div className="job-detail-line">
              <span className="job-label">{t('jobCard.who')} </span>
              <span className="job-value">{job.organization}</span>
              <br />
            </div>
            <div className="job-detail-line">
              <span className="job-label">{t('jobCard.what')} </span>
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
              <span className="job-label">{t('jobCard.where')} </span>
              <span className="job-value">{job.location || t('jobCard.nA')}</span>
              <br />
            </div>
            {job.summary && (
              <div className="job-detail-line">
                <span className="job-label">{t('jobCard.why')} </span>
                <span className="job-value">{job.summary}</span>
                <br />
              </div>
            )}
            <div className="job-detail-line">
              <span className="job-label">{t('jobCard.when')} </span>
              <span className="job-value">{t('jobCard.posted')} {formatDate(job.date_posted)}</span>
              <br />
            </div>
            <div className="job-detail-line">
              <span className="job-label">{t('jobCard.howMuch')} </span>
              <span className="job-value">{job.wage || t('jobCard.nA')}</span>
            </div>
          </div>
        </div>
      </Collapsible>
      
      {/* Values Section */}
      {job.values && job.values.length > 0 && (
        <div className={`px-4 py-3 bg-wev-surface-tint ${isExpanded ? 'border-t border-wev-border' : ''}`}>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Match Score - only show when user is logged in */}
            {user && (
              <div className="flex-center-gap">
                <ProgressDonut 
                  percentage={matchPercentage} 
                  size="sm"
                />
                <span className="text-sm text-wev-text-secondary font-medium">
                  {matchPercentage}{t('jobCard.match')}
                </span>
              </div>
            )}
            
            {/* Values pills */}
            {job.values.map((value) => {
              const valueName = t(`values.${value}.name`, { defaultValue: value })
              const valueDef = getValueDefinition(value, {
                name: valueName,
                description: t(`values.${value}.description`),
                example: t(`values.${value}.example`),
              })
              return (
                <Tooltip
                  key={value}
                  content={
                    `<p class="font-medium text-wev-primary-text mb-1">${valueName}</p>
                     <p class="text-xs text-wev-text-primary mb-2">${valueDef.description}</p>
                     <p class="text-xs text-wev-text-secondary italic">${valueDef.example}</p>`
                  }
                >
                  <Pill 
                    variant={user ? (isValueMatched(value) ? 'primary' : 'secondary') : 'default'} 
                    size="sm"
                    icon={user && isValueMatched(value) ? '✓' : undefined}
                  >
                    {valueName}
                  </Pill>
                </Tooltip>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
