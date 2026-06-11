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

  // Derive skill labels/definitions from global map or fallback
  const skillLabels = useMemo(() => {
    const source = skillLabelsProp ?? job.skill_labels ?? {};
    const terms: Record<string, string> = {};
    const defs: Record<string, string> = {};
    for (const uri of job.skills || []) {
      const l = source[uri];

      // Fallback: Use the final portion of the URI path and format it (e.g. "teamwork" from ".../team-work").
      // Only replace dashes if it looks like a URI slug (has slashes) to avoid mangling simple test strings.
      const lastPart = uri.includes('/') ? uri.split('/').pop() : uri;
      const fallbackTerm =
        lastPart && uri.includes('/') ? lastPart.replace(/-/g, ' ') : (lastPart ?? uri);

      terms[uri] = l?.term ?? fallbackTerm;

      const parts = [l?.definition, l?.scope_note].filter(Boolean);
      if (parts.length > 0) defs[uri] = parts.join('<br/><br/>');
    }
    return { terms, defs };
  }, [job.skill_labels, job.skills, skillLabelsProp]);

  const {
    bookmarked,
    isLoading: bookmarkLoading,
    toggleBookmark,
  } = useBookmarkAction(job, userId, initialBookmarked, onBookmarkToggle);

  // Sync internal expansion state with prop changes
  useEffect(() => {
    setIsExpanded(initialExpanded);
  }, [initialExpanded]);

  // Match Scoring Logic
  const scoreData = useMemo(() => {
    if (!matchProp) return null;
    const round = (val: number | null | undefined) => (val != null ? Math.round(val * 100) : 0);
    return {
      total: round(matchProp.score),
      values: round(matchProp.value_score),
      skills: round(matchProp.skill_score),
      workType: matchProp.work_type_score != null ? round(matchProp.work_type_score) : undefined,
      location: matchProp.location_score != null ? round(matchProp.location_score) : undefined,
    };
  }, [matchProp]);

  const profilePreferences = useMemo(() => {
    const workTypes = profile?.work_types ?? [];
    const hasLocationValue =
      (profile?.values ?? []).some((v) => v.toLowerCase() === 'location') ||
      (profile?.values_rated ?? []).some((rv) => rv.value.toLowerCase() === 'location');
    return { workTypes, hasLocationValue };
  }, [profile]);

  const matchTooltipContent = useMemo<ReactNode | null>(() => {
    if (!matchProp || !scoreData) return null;
    return (
      <MatchDetailsTooltip
        totalMatchPercentage={scoreData.total}
        valueMatchPercentage={scoreData.values}
        skillMatchPercentage={scoreData.skills}
        workTypeMatchPercentage={scoreData.workType}
        locationMatchPercentage={scoreData.location}
        jobWorkType={job.work_type}
        jobMunicipality={job.municipality}
        profileWorkTypes={profilePreferences.workTypes}
        profileHasLocationValue={profilePreferences.hasLocationValue}
        values={job.values || []}
        skills={job.skills || []}
        sharedValues={matchProp.shared_values || []}
        sharedSkills={matchProp.shared_skills || []}
        skillTerms={skillLabels.terms}
        translate={(key, values) => t(key, values)}
      />
    );
  }, [matchProp, scoreData, job, profilePreferences, skillLabels.terms, t]);

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
