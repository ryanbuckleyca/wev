'use client';

import { useState, useEffect, useMemo, ReactNode } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { JobPosting, JobMatchData } from '@/lib/supabase';
import { Lineicons } from '@lineiconshq/react-lineicons';
import {
  Leaf1Solid,
  Leaf1Outlined,
  Bookmark1Solid,
  Bookmark1Outlined,
  ChevronDownSolid,
} from '@lineiconshq/free-icons';
import { useAuth } from '@/contexts/AuthContext';
import { formatCompensation } from '@/lib/compensation/helpers';
import Collapsible from './Collapsible';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from '@/i18n/navigation';
import MatchDetailsTooltip from './MatchDetailsTooltip';
import JobCardFooter from './JobCardFooter';

interface JobCardProps {
  job: JobPosting;
  isAdmin: boolean;
  onSseToggle: (job: JobPosting) => void;
  onBookmarkToggle?: (job: JobPosting, bookmarked: boolean) => void;
  updatingId: string | null;
  initialExpanded?: boolean;
  match?: JobMatchData | null;
  initialBookmarked?: boolean;
  selectedWorkTypes?: string[];
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
  selectedWorkTypes,
}: JobCardProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  // Derive skill display maps from pre-resolved labels embedded in the job
  const skillTerms: Record<string, string> = useMemo(() => {
    const labels = job.skill_labels ?? {};
    return Object.fromEntries(Object.entries(labels).map(([uri, l]) => [uri, l.term]));
  }, [job.skill_labels]);

  const skillDefinitions: Record<string, string> = useMemo(() => {
    const labels = job.skill_labels ?? {};
    const result: Record<string, string> = {};
    for (const [uri, l] of Object.entries(labels)) {
      const parts = [];
      if (l.definition) parts.push(l.definition);
      if (l.scope_note) parts.push(l.scope_note);
      if (parts.length > 0) result[uri] = parts.join('<br/><br/>');
    }
    return result;
  }, [job.skill_labels]);

  // Get user state
  const t = useTranslations();
  const locale = useLocale();
  const { user } = useAuth();
  const router = useRouter();

  // Use passed-in match data (batch-fetched by parent)
  const totalMatchPercentage = matchProp?.score != null ? Math.round(matchProp.score * 100) : 0;
  const valueMatchPercentage =
    matchProp?.value_score != null ? Math.round(matchProp.value_score * 100) : 0;
  const skillMatchPercentage =
    matchProp?.skill_score != null ? Math.round(matchProp.skill_score * 100) : 0;
  const matchTooltipContent = useMemo<ReactNode | null>(() => {
    if (!matchProp) return null;

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
    );
  }, [
    matchProp,
    job.values,
    job.skills,
    skillTerms,
    t,
    totalMatchPercentage,
    valueMatchPercentage,
    skillMatchPercentage,
  ]);

  // Sync internal state with prop changes
  useEffect(() => {
    setIsExpanded(initialExpanded);
  }, [initialExpanded]);

  useEffect(() => {
    setBookmarked(initialBookmarked);
  }, [initialBookmarked]);

  const sse = !!job.is_sse;

  const getCardSummary = (job: JobPosting) => {
    const title =
      job.job_title.length > 25 ? job.job_title.substring(0, 25) + '...' : job.job_title;
    const location = job.location || t('jobCard.remote');

    // Simple date formatting for header
    let date: Date;
    if (
      typeof job.date_posted === 'string' &&
      !job.date_posted.endsWith('Z') &&
      !job.date_posted.match(/[+-]\d{2}:\d{2}$/)
    ) {
      date = new Date(job.date_posted + 'Z');
    } else {
      date = new Date(job.date_posted);
    }
    const dateStr = date.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
    });

    return `${job.organization} - ${title} • ${location} • ${dateStr}`;
  };

  const formatDate = (dateString: string): string => {
    // Parse date string - if it doesn't have timezone, treat as UTC
    let date: Date;
    if (
      typeof dateString === 'string' &&
      !dateString.endsWith('Z') &&
      !dateString.match(/[+-]\d{2}:\d{2}$/)
    ) {
      date = new Date(dateString + 'Z');
    } else {
      date = new Date(dateString);
    }
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York',
    });
  };

  const handleBookmarkToggle = () => {
    if (!user) {
      router.push('/login');
      return;
    }

    const newBookmarkState = !bookmarked;
    // Optimistic UI
    setBookmarked(newBookmarkState);
    onBookmarkToggle?.(job, newBookmarkState);
    (async () => {
      setBookmarkLoading(true);
      const supabase = createClient();
      try {
        if (newBookmarkState) {
          const { error } = await supabase
            .from('bookmarks')
            .insert([{ user_id: user.id, job_id: job.id }]);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('bookmarks')
            .delete()
            .eq('user_id', user.id)
            .eq('job_id', job.id);
          if (error) throw error;
        }
      } catch (err) {
        console.error('Bookmark update failed:', err);
        // rollback
        setBookmarked(!newBookmarkState);
        onBookmarkToggle?.(job, !newBookmarkState);
      } finally {
        setBookmarkLoading(false);
      }
    })();
  };

  // Check if there will be a footer
  const hasFooter = (job.values && job.values.length > 0) || (job.skills && job.skills.length > 0);

  return (
    <div className="relative rounded-wev-card transition-all duration-300 bg-card border border-border hover:border-primary overflow-hidden">
      {/* Card Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 rounded-t-wev-card transition-all duration-300 bg-card ${hasFooter ? 'border-b border-border' : ''}`}
      >
        {/* Left side: SSE + Summary */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isAdmin ? (
            <button
              onClick={() => {
                const msg = sse
                  ? t('jobCard.removeSseConfirm', { title: job.job_title, org: job.organization })
                  : t('jobCard.markSseConfirm', { title: job.job_title, org: job.organization });
                if (window.confirm(msg)) onSseToggle(job);
              }}
              disabled={updatingId === job.id}
              className="wev-icon-btn disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              title={sse ? t('jobCard.removeSse') : t('jobCard.markSse')}
              aria-label={sse ? t('jobCard.sseJob') : t('jobCard.markSseJob')}
            >
              {sse ? (
                <Lineicons icon={Leaf1Solid} size={16} className="text-wev-success" />
              ) : (
                <Lineicons icon={Leaf1Outlined} size={16} className="text-muted-foreground" />
              )}
            </button>
          ) : sse ? (
            <span className="flex-shrink-0" aria-label={t('jobCard.sseJobLabel')}>
              <Lineicons icon={Leaf1Solid} size={16} className="text-wev-success" />
            </span>
          ) : null}
          <span className="text-sm text-muted-foreground truncate pr-2">{getCardSummary(job)}</span>
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
              <Lineicons icon={Bookmark1Outlined} size={16} className="text-muted-foreground" />
            )}
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="wev-icon-btn"
            title={isExpanded ? t('jobCard.collapse') : t('jobCard.expand')}
            aria-label={isExpanded ? t('jobCard.collapseDetails') : t('jobCard.expandDetails')}
          >
            <Lineicons
              icon={ChevronDownSolid}
              size={18}
              className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Card Content */}
      <Collapsible isOpen={isExpanded}>
        <div className="py-4 px-5 bg-card">
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
              <span className="job-value">
                {t('jobCard.posted')} {formatDate(job.date_posted)}
              </span>
              <br />
            </div>
            <div className="job-detail-line">
              {(() => {
                const compensationDisplay = formatCompensation(job, locale)
                return (
                  <>
                    <span className="job-label">{t('jobCard.howMuch')} </span>
                    <span className="job-value">{compensationDisplay.primary}</span>
                    {compensationDisplay.secondary && (
                      <span className="job-value text-muted-foreground text-sm"> ({compensationDisplay.secondary})</span>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      </Collapsible>

      {(job.values && job.values.length > 0) || (job.skills && job.skills.length > 0) ? (
        <div className={`px-4 py-3 bg-muted ${isExpanded ? 'border-t border-border' : ''}`}>
          <JobCardFooter
            values={job.values || []}
            skills={job.skills || []}
            sharedValues={matchProp?.shared_values || []}
            sharedSkills={matchProp?.shared_skills || []}
            skillTerms={skillTerms}
            skillDefinitions={skillDefinitions}
            totalMatchPercentage={totalMatchPercentage}
            matchTooltipContent={matchTooltipContent}
            showTooltip={Boolean(user && matchProp && matchTooltipContent)}
            fadeBackground="var(--muted)"
            workType={job.work_type}
            selectedWorkTypes={selectedWorkTypes || []}
          />
        </div>
      ) : null}
    </div>
  );
}
