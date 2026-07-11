'use client';

import { useState, useEffect, useMemo, ReactNode, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { JobPosting, JobMatchData } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase/profiles';
import { parseDateString } from '@/lib/date-utils';
import Collapsible from './Collapsible';
import MatchDetailsTooltip from './MatchDetailsTooltip';
import JobCardFooter from './JobCardFooter';
import JobCardHeader from './JobCardHeader';
import JobCardDetails from './JobCardDetails';
import { useBookmarkAction } from '@/lib/hooks/useBookmarkAction';
import {
  buildJobMatchTooltipProps,
  buildProfileMatchPreferences,
  buildRoundedMatchScores,
  buildSkillLabelMaps,
} from '@/lib/bulletin/job-match-display';
import type { SkillLabel } from '@/lib/bulletin/types';
import { JOB_BOARD_TEST_IDS } from '@/lib/testing/job-board-contract';

interface JobCardProps {
  job: JobPosting;
  isAdmin: boolean;
  userId: string | null;
  profile: Profile | null;
  onSseToggle: (job: JobPosting) => void;
  onBookmarkToggle?: (job: JobPosting, bookmarked: boolean) => void;
  updatingId: string | null;
  initialExpanded?: boolean;
  match?: JobMatchData | null;
  matchLoading?: boolean;
  initialBookmarked?: boolean;
  selectedWorkTypes?: string[];
  selectedLanguages?: string[];
  skillLabels?: Record<string, SkillLabel>;
}

export default function JobCard({
  job,
  isAdmin,
  userId,
  profile,
  onSseToggle,
  onBookmarkToggle,
  updatingId,
  initialExpanded = true,
  match: matchProp,
  matchLoading = false,
  initialBookmarked = false,
  selectedWorkTypes,
  selectedLanguages,
  skillLabels: skillLabelsProp,
}: JobCardProps) {
  const t = useTranslations();
  const locale = useLocale();
  const dateLocale = locale === 'fr' ? 'fr-CA' : 'en-CA';

  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const skillLabels = useMemo(
    () => buildSkillLabelMaps(job.skills || [], skillLabelsProp ?? job.skill_labels ?? {}),
    [job.skill_labels, job.skills, skillLabelsProp],
  );

  const {
    bookmarked,
    isLoading: bookmarkLoading,
    toggleBookmark,
  } = useBookmarkAction(job, userId, initialBookmarked, onBookmarkToggle);

  // Sync internal expansion state with prop changes
  useEffect(() => {
    setIsExpanded(initialExpanded);
  }, [initialExpanded]);

  const scoreData = useMemo(
    () => (matchProp ? buildRoundedMatchScores(matchProp) : null),
    [matchProp],
  );

  const profilePreferences = useMemo(() => buildProfileMatchPreferences(profile), [profile]);

  const matchTooltipContent = useMemo<ReactNode | null>(() => {
    if (!matchProp || !scoreData) return null;
    return (
      <MatchDetailsTooltip
        {...buildJobMatchTooltipProps({
          match: matchProp,
          scoreData,
          values: job.values || [],
          skills: job.skills || [],
          skillTerms: skillLabels.terms,
          workType: job.work_type,
          municipality: job.municipality,
          profilePreferences,
        })}
      />
    );
  }, [matchProp, scoreData, job, profilePreferences, skillLabels.terms]);

  const getCardSummary = useCallback(() => {
    const title =
      job.job_title.length > 25 ? job.job_title.substring(0, 25) + '...' : job.job_title;
    const location = job.location || t('jobCard.remote');
    const dateStr = parseDateString(job.date_posted).toLocaleDateString(dateLocale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'America/New_York',
    });
    return `${job.organization} - ${title} • ${location} • ${dateStr}`;
  }, [dateLocale, job, t]);

  const formatDate = useCallback(
    (dateString: string): string =>
      parseDateString(dateString).toLocaleDateString(dateLocale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'America/New_York',
      }),
    [dateLocale],
  );

  const hasFooter =
    (job.values && job.values.length > 0) ||
    (job.skills && job.skills.length > 0) ||
    !!job.language;

  return (
    <article
      data-testid={JOB_BOARD_TEST_IDS.jobCard}
      aria-label={`${job.job_title} at ${job.organization}`}
      className="relative rounded-wev-card transition-all duration-300 bg-card border border-border hover:border-primary overflow-hidden"
    >
      <JobCardHeader
        job={job}
        isAdmin={isAdmin}
        sse={!!job.is_sse}
        updatingId={updatingId}
        onSseToggle={onSseToggle}
        bookmarked={bookmarked}
        bookmarkLoading={bookmarkLoading}
        onBookmarkToggle={toggleBookmark}
        isExpanded={isExpanded}
        onExpandToggle={() => setIsExpanded(!isExpanded)}
        summary={getCardSummary()}
        hasFooter={hasFooter}
        t={t}
      />

      <Collapsible isOpen={isExpanded}>
        <JobCardDetails job={job} locale={locale} t={t} formatDate={formatDate} />
      </Collapsible>

      {hasFooter && (
        <div className={`px-4 py-3 bg-muted ${isExpanded ? 'border-t border-border' : ''}`}>
          <JobCardFooter
            values={job.values || []}
            skills={job.skills || []}
            sharedValues={matchProp?.shared_values || []}
            sharedSkills={matchProp?.shared_skills || []}
            skillTerms={skillLabels.terms}
            skillDefinitions={skillLabels.defs}
            totalMatchPercentage={scoreData?.total ?? 0}
            matchTooltipContent={matchTooltipContent}
            showTooltip={Boolean(userId && matchProp && matchTooltipContent)}
            showMatchLoading={Boolean(userId && matchLoading && !matchProp)}
            fadeBackground="var(--muted)"
            workType={job.work_type}
            selectedWorkTypes={selectedWorkTypes || []}
            language={job.language}
            selectedLanguages={selectedLanguages || []}
          />
        </div>
      )}
    </article>
  );
}
