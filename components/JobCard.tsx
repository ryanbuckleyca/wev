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
import type { Profile } from '@/lib/supabase/profiles';
import { formatCompensation } from '@/lib/compensation/helpers';
import { parseDateString } from '@/lib/date-utils';
import { buildJobText, computeLocationTokens, profileHasLocationValue } from '@/lib/match-utils';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from '@/i18n/navigation';
import Collapsible from './Collapsible';
import ConfirmDialog from './ConfirmDialog';
import MatchDetailsTooltip from './MatchDetailsTooltip';
import JobCardFooter from './JobCardFooter';

interface JobCardProps {
  job: JobPosting;
  isAdmin: boolean;
  /** Profile of the currently logged-in user, passed from the parent to avoid per-card fetches. */
  profile: Profile | null;
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
  profile,
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
  const [confirmSse, setConfirmSse] = useState(false);

  const t = useTranslations();
  const locale = useLocale();
  const { user } = useAuth();
  const router = useRouter();

  // Derive skill display maps from pre-resolved labels embedded in the job
  const skillTerms: Record<string, string> = useMemo(() => {
    const labels = job.skill_labels ?? {};
    return Object.fromEntries(Object.entries(labels).map(([uri, l]) => [uri, l.term]));
  }, [job.skill_labels]);

  const skillDefinitions: Record<string, string> = useMemo(() => {
    const labels = job.skill_labels ?? {};
    const result: Record<string, string> = {};
    for (const [uri, l] of Object.entries(labels)) {
      const parts: string[] = [];
      if (l.definition) parts.push(l.definition);
      if (l.scope_note) parts.push(l.scope_note);
      if (parts.length > 0) result[uri] = parts.join('<br/><br/>');
    }
    return result;
  }, [job.skill_labels]);

  // Profile-derived preferences and computed tokens for location matching
  const profileWorkTypes = useMemo(() => profile?.work_types ?? [], [profile?.work_types]);
  const profileIdeal = profile?.ideal_work_environment ?? null;

  const { matched: matchedLocationTokens, unmatched: unmatchedLocationTokens } = useMemo(() => {
    const jobText = buildJobText(job.location, job.summary);
    return computeLocationTokens(profileIdeal, jobText);
  }, [job.location, job.summary, profileIdeal]);

  const hasLocationValue = useMemo(
    () => profileHasLocationValue(profile?.values, profile?.values_rated),
    [profile?.values, profile?.values_rated],
  );

  // Match percentages derived from batch-fetched match data
  const totalMatchPercentage = matchProp?.score != null ? Math.round(matchProp.score * 100) : 0;
  const valueMatchPercentage =
    matchProp?.value_score != null ? Math.round(matchProp.value_score * 100) : 0;
  const skillMatchPercentage =
    matchProp?.skill_score != null ? Math.round(matchProp.skill_score * 100) : 0;
  const workTypeMatchPercentage =
    matchProp?.work_type_score != null ? Math.round(matchProp.work_type_score * 100) : undefined;
  const locationMatchPercentage =
    matchProp?.location_score != null ? Math.round(matchProp.location_score * 100) : undefined;

  const matchTooltipContent = useMemo<ReactNode | null>(() => {
    if (!matchProp) return null;
    return (
      <MatchDetailsTooltip
        totalMatchPercentage={totalMatchPercentage}
        valueMatchPercentage={valueMatchPercentage}
        skillMatchPercentage={skillMatchPercentage}
        workTypeMatchPercentage={workTypeMatchPercentage}
        locationMatchPercentage={locationMatchPercentage}
        jobWorkType={job.work_type}
        profileWorkTypes={profileWorkTypes}
        profileIdealWorkEnvironment={profileIdeal}
        profileHasLocationValue={hasLocationValue}
        matchedLocationTokens={matchedLocationTokens}
        unmatchedLocationTokens={unmatchedLocationTokens}
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
    job.work_type,
    skillTerms,
    t,
    totalMatchPercentage,
    valueMatchPercentage,
    skillMatchPercentage,
    workTypeMatchPercentage,
    locationMatchPercentage,
    profileWorkTypes,
    profileIdeal,
    hasLocationValue,
    matchedLocationTokens,
    unmatchedLocationTokens,
  ]);

  // Sync internal state with prop changes
  useEffect(() => { setIsExpanded(initialExpanded); }, [initialExpanded]);
  useEffect(() => { setBookmarked(initialBookmarked); }, [initialBookmarked]);

  const sse = !!job.is_sse;

  const formatDate = (dateString: string): string =>
    parseDateString(dateString).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York',
    });

  const getCardSummary = (): string => {
    const date = parseDateString(job.date_posted);
    const dateStr = date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    const location = job.location || t('jobCard.remote');
    return `${job.organization} - ${job.job_title} • ${location} • ${dateStr}`;
  };

  const handleBookmarkToggle = async () => {
    if (!user) {
      router.push('/login');
      return;
    }

    const newBookmarkState = !bookmarked;
    // Optimistic update
    setBookmarked(newBookmarkState);
    onBookmarkToggle?.(job, newBookmarkState);

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
      // Rollback optimistic update
      setBookmarked(!newBookmarkState);
      onBookmarkToggle?.(job, !newBookmarkState);
    } finally {
      setBookmarkLoading(false);
    }
  };

  const hasFooter =
    (job.values && job.values.length > 0) || (job.skills && job.skills.length > 0);

  return (
    <div className="relative rounded-wev-card transition-all duration-300 bg-card border border-border hover:border-primary overflow-hidden">
      {/* SSE confirmation dialog */}
      <ConfirmDialog
        open={confirmSse}
        title={sse ? t('jobCard.removeSse') : t('jobCard.markSse')}
        description={
          sse
            ? t('jobCard.removeSseConfirm', { title: job.job_title, org: job.organization })
            : t('jobCard.markSseConfirm', { title: job.job_title, org: job.organization })
        }
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => { setConfirmSse(false); onSseToggle(job); }}
        onCancel={() => setConfirmSse(false)}
      />

      {/* Card Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 rounded-t-wev-card transition-all duration-300 bg-card ${hasFooter ? 'border-b border-border' : ''}`}
      >
        {/* Left side: SSE + Summary */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isAdmin ? (
            <button
              onClick={() => setConfirmSse(true)}
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
          <span className="text-sm text-muted-foreground truncate pr-2">{getCardSummary()}</span>
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
                const compensationDisplay = formatCompensation(job, locale, {
                  perYear: t('jobCard.perYear'),
                  perHour: t('jobCard.perHour'),
                  statedHoursPerWeek: (hours) => t('jobCard.statedHoursPerWeek', { hours }),
                  volunteer: t('jobCard.volunteer'),
                  internship: t('jobCard.internship'),
                });
                return (
                  <>
                    <span className="job-label">{t('jobCard.howMuch')} </span>
                    <span className="job-value">{compensationDisplay.primary}</span>
                    {compensationDisplay.secondary && (
                      <span className="job-value text-muted-foreground text-sm">
                        {' '}({compensationDisplay.secondary})
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </Collapsible>

      {hasFooter && (
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
      )}
    </div>
  );
}
