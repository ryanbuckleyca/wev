'use client';

import { useState, useEffect, useMemo, ReactNode, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { JobPosting, JobMatchData } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Profile } from '@/lib/supabase/profiles';
import { parseDateString } from '@/lib/date-utils';
import Collapsible from './Collapsible';
import MatchDetailsTooltip from './MatchDetailsTooltip';
import JobCardFooter from './JobCardFooter';
import JobCardHeader from './JobCardHeader';
import JobCardDetails from './JobCardDetails';
import { useBookmarkAction } from '@/lib/hooks/useBookmarkAction';

interface JobCardProps {
  job: JobPosting;
  isAdmin: boolean;
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
  const t = useTranslations();
  const locale = useLocale();
  const { user } = useAuth();

  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  // Derive skill labels/definitions
  const skillLabels = useMemo(() => {
    const labels = job.skill_labels ?? {};
    const terms: Record<string, string> = {};
    const defs: Record<string, string> = {};
    for (const [uri, l] of Object.entries(labels)) {
      terms[uri] = l.term;
      const parts = [l.definition, l.scope_note].filter(Boolean);
      if (parts.length > 0) defs[uri] = parts.join('<br/><br/>');
    }
    return { terms, defs };
  }, [job.skill_labels]);

  const { bookmarked, isLoading: bookmarkLoading, toggleBookmark } = useBookmarkAction(
    job,
    user,
    initialBookmarked,
    onBookmarkToggle,
  );

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
    const title = job.job_title.length > 25 ? job.job_title.substring(0, 25) + '...' : job.job_title;
    const location = job.location || t('jobCard.remote');
    const dateStr = parseDateString(job.date_posted).toLocaleDateString(locale, {
      month: 'short', day: 'numeric',
    });
    return `${job.organization} - ${title} • ${location} • ${dateStr}`;
  }, [job, t, locale]);

  const formatDate = useCallback((dateString: string): string =>
    parseDateString(dateString).toLocaleDateString(locale, {
      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York',
    }), [locale]);

  const hasFooter = (job.values && job.values.length > 0) || (job.skills && job.skills.length > 0);

  return (
    <div className="relative rounded-wev-card transition-all duration-300 bg-card border border-border hover:border-primary overflow-hidden">
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
