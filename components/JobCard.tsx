'use client'

import { useState, useEffect, useMemo, ReactNode } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { JobPosting, JobMatchData } from '@/lib/supabase'
import { Lineicons } from '@lineiconshq/react-lineicons'
import { Leaf1Solid, Leaf1Outlined, Bookmark1Solid, Bookmark1Outlined, ChevronDownSolid, ChevronUpSolid } from '@lineiconshq/free-icons'
import Tooltip from './Tooltip'
import { useAuth } from '@/contexts/AuthContext'
import ProgressDonut from './ProgressDonut'
import Collapsible from './Collapsible'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from '@/i18n/navigation'
import MatchDetailsTooltip from './MatchDetailsTooltip'
import JobCardFooter from './JobCardFooter'

interface JobCardProps {
  job: JobPosting
  isAdmin: boolean
  onSseToggle: (job: JobPosting) => void
  onBookmarkToggle?: (job: JobPosting, bookmarked: boolean) => void
  updatingId: string | null
  initialExpanded?: boolean
  match?: JobMatchData | null
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
  const [skillTerms, setSkillTerms] = useState<Record<string, string>>({})
  const [skillDefinitions, setSkillDefinitions] = useState<Record<string, string>>({})

  // Get user state
  const t = useTranslations()
  const locale = useLocale()
  const { user } = useAuth()
  const router = useRouter()

  // Use passed-in match data (batch-fetched by parent)
  const totalMatchPercentage = matchProp?.score != null ? Math.round(matchProp.score * 100) : 0
  const valueMatchPercentage = matchProp?.value_score != null ? Math.round(matchProp.value_score * 100) : 0
  const skillMatchPercentage = matchProp?.skill_score != null ? Math.round(matchProp.skill_score * 100) : 0
  const isValueMatched = (value: string) => matchProp?.shared_values?.includes(value) ?? false
  const isSkillMatched = (skill: string) => matchProp?.shared_skills?.includes(skill) ?? false
  const matchTooltipContent = useMemo<ReactNode | null>(() => {
    if (!matchProp) return null

    return (
      <MatchDetailsTooltip
        totalMatchPercentage={totalMatchPercentage}
        valueMatchPercentage={valueMatchPercentage}
        skillMatchPercentage={skillMatchPercentage}
        values={job.values || []}
        skills={job.skills || []}
        sharedValues={matchProp.shared_values || []}
        sharedSkills={matchProp.shared_skills || []}
        skillTerms={skillTerms}
        translate={(key, values) => t(key, values)}
      />
    )
  }, [
    matchProp,
    job.values,
    job.skills,
    skillTerms,
    t,
    totalMatchPercentage,
    valueMatchPercentage,
    skillMatchPercentage
  ])
  
  // Sync internal state with prop changes
  useEffect(() => {
    setIsExpanded(initialExpanded)
  }, [initialExpanded])

  useEffect(() => {
    setBookmarked(initialBookmarked)
  }, [initialBookmarked])

  useEffect(() => {
    const skills = job.skills ?? []
    if (skills.length === 0) {
      setSkillTerms({})
      setSkillDefinitions({})
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const params = new URLSearchParams({
          uris: skills.join(','),
          locale,
        })
        const res = await fetch(`/api/skills/by-uri?${params.toString()}`, { cache: 'no-store' })
        if (!res.ok) {
          return
        }
        const body = await res.json()
        if (cancelled) {
          return
        }
        const nextTerms: Record<string, string> = {}
        const nextDefinitions: Record<string, string> = {}
        for (const row of body.skills ?? []) {
          if (row?.concept_uri && row?.term) {
            nextTerms[row.concept_uri] = row.term
            // Build tooltip from definition and scope note
            const parts = []
            if (row.definition) parts.push(row.definition)
            if (row.scope_note) parts.push(row.scope_note)
            if (parts.length > 0) {
              nextDefinitions[row.concept_uri] = parts.join('<br/><br/>')
            }
          }
        }
        setSkillTerms(nextTerms)
        setSkillDefinitions(nextDefinitions)
      } catch (error) {
        console.error('Failed to fetch skill labels:', error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [job.skills, locale])
  
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
        <div className="flex items-center gap-1.5 shrink-0">
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
      
      {(job.values && job.values.length > 0) || (job.skills && job.skills.length > 0) ? (
        <div className={`px-4 py-3 bg-wev-surface-tint ${isExpanded ? 'border-t border-wev-border' : ''}`}>
          <JobCardFooter
            values={job.values || []}
            skills={job.skills || []}
            sharedValues={matchProp?.shared_values || []}
            sharedSkills={matchProp?.shared_skills || []}
            isValueMatched={isValueMatched}
            isSkillMatched={isSkillMatched}
            skillTerms={skillTerms}
            skillDefinitions={skillDefinitions}
            totalMatchPercentage={totalMatchPercentage}
            matchTooltipContent={matchTooltipContent}
            showTooltip={Boolean(user && matchProp && matchTooltipContent)}
            fadeBackground="#f9fafb"
          />
        </div>
      ) : null}

    </div>
  )
}
