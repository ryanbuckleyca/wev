'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  buildJobMatchTooltipProps,
  buildProfileMatchPreferences,
  buildRoundedMatchScores,
  buildSkillLabelMaps,
} from '@/lib/bulletin/job-match-display';
import { fetchMatchMapForJobs } from '@/lib/bulletin/match-map';
import { parseDateString } from '@/lib/date-utils';
import { safeUrl } from '@/lib/url';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import type { OrgJobPosting } from '@/lib/organizations/types';
import type { JobMatchData, JobPosting } from '@/lib/supabase';
import CardFooter from './CardFooter';
import JobCardDetails from './JobCardDetails';
import MatchDetailsTooltip from './MatchDetailsTooltip';

function toJobPosting(job: OrgJobPosting, org: { name: string; slug: string | null }): JobPosting {
  const url = safeUrl(job.listing_url);
  const workType =
    job.work_type === 'remote' || job.work_type === 'hybrid' || job.work_type === 'office'
      ? job.work_type
      : 'office';

  return {
    id: job.id,
    job_title: job.job_title,
    organization: org.name,
    organization_slug: org.slug,
    location: job.location || '',
    municipality: job.municipality ?? null,
    province: job.province ?? null,
    work_type: workType,
    date_posted: job.date_posted || '',
    close_date: null,
    wage: job.wage ?? null,
    listing_url: url ?? '',
    employment_type: job.employment_type,
    summary: job.summary ?? null,
    values: job.values ?? undefined,
    skills: job.skills ?? undefined,
    skill_labels: job.skill_labels,
    unit_text: (job.unit_text as JobPosting['unit_text']) ?? null,
    min_value: job.min_value ?? null,
    max_value: job.max_value ?? null,
    hours_per_week: job.hours_per_week ?? null,
    language: job.language ?? null,
  };
}

function JobSkillFooter({
  job,
  match,
  matchLoading,
  userId,
}: {
  job: OrgJobPosting;
  match?: JobMatchData | null;
  matchLoading: boolean;
  userId: string | null;
}) {
  const { profile } = useProfile();
  const skills = useMemo(() => job.skills ?? [], [job.skills]);
  const values = useMemo(() => job.values ?? [], [job.values]);

  const skillLabels = useMemo(
    () => buildSkillLabelMaps(skills, job.skill_labels ?? {}),
    [job.skill_labels, skills],
  );

  const scoreData = useMemo(() => (match ? buildRoundedMatchScores(match) : null), [match]);

  const profilePreferences = useMemo(() => buildProfileMatchPreferences(profile), [profile]);

  const matchTooltipContent = useMemo(() => {
    if (!match || !scoreData) return null;
    return (
      <MatchDetailsTooltip
        {...buildJobMatchTooltipProps({
          match,
          scoreData,
          values,
          skills,
          skillTerms: skillLabels.terms,
          workType: job.work_type as 'remote' | 'hybrid' | 'office' | null,
          municipality: job.municipality ?? null,
          profilePreferences,
        })}
      />
    );
  }, [
    match,
    scoreData,
    job.work_type,
    job.municipality,
    values,
    skills,
    skillLabels.terms,
    profilePreferences,
  ]);

  const hasFooter = skills.length > 0 || values.length > 0 || Boolean(job.language);
  if (!hasFooter) return null;

  return (
    <div className="border-t border-border bg-muted px-4 py-3">
      <CardFooter
        values={values}
        skills={skills}
        sharedValues={match?.shared_values || []}
        sharedSkills={match?.shared_skills || []}
        skillTerms={skillLabels.terms}
        skillDefinitions={skillLabels.defs}
        totalMatchPercentage={scoreData?.total ?? 0}
        matchTooltipContent={matchTooltipContent}
        showTooltip={Boolean(userId && match && matchTooltipContent)}
        showMatchLoading={Boolean(userId && matchLoading && !match)}
        fadeBackground="var(--muted)"
        workType={job.work_type as 'remote' | 'hybrid' | 'office' | undefined}
        selectedWorkTypes={profile?.work_types ?? []}
        language={job.language ?? undefined}
        selectedLanguages={[]}
        isLoggedIn={!!userId}
      />
    </div>
  );
}

export default function OrganizationJobRow({
  job,
  org,
  match,
  matchLoading = false,
  userId = null,
}: {
  job: OrgJobPosting;
  org: { name: string; slug: string | null };
  match?: JobMatchData | null;
  matchLoading?: boolean;
  userId?: string | null;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const dateLocale = locale === 'fr' ? 'fr-CA' : 'en-CA';

  const posting = useMemo(() => toJobPosting(job, org), [job, org]);

  const formatDate = useCallback(
    (dateString: string): string => {
      if (!dateString) return t('jobCard.nA');
      const parsed = parseDateString(dateString);
      if (Number.isNaN(parsed.getTime())) return t('jobCard.nA');
      return parsed.toLocaleDateString(dateLocale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'America/New_York',
      });
    },
    [dateLocale, t],
  );

  return (
    <article
      aria-label={t('jobCard.roleAtOrg', { title: job.job_title, org: org.name })}
      className="overflow-hidden rounded-wev-card border border-border bg-card transition-colors hover:border-primary"
    >
      <JobCardDetails job={posting} locale={locale} t={t} formatDate={formatDate} />
      <JobSkillFooter job={job} match={match} matchLoading={matchLoading} userId={userId} />
    </article>
  );
}

/** Client list that hydrates job_matches for the visible org jobs. */
export function OrganizationJobsList({
  jobs,
  org,
}: {
  jobs: OrgJobPosting[];
  org: { name: string; slug: string | null };
}) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [matchData, setMatchData] = useState<Map<string, JobMatchData>>(new Map());
  const [matchLoading, setMatchLoading] = useState(false);

  useEffect(() => {
    if (!userId || jobs.length === 0) {
      setMatchData(new Map());
      setMatchLoading(false);
      return;
    }

    let cancelled = false;
    setMatchLoading(true);
    void fetchMatchMapForJobs(
      userId,
      jobs.map((job) => job.id),
    )
      .then((matches) => {
        if (!cancelled) setMatchData(matches);
      })
      .finally(() => {
        if (!cancelled) setMatchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, jobs]);

  return (
    <div className="flex flex-col gap-3">
      {jobs.map((job) => (
        <OrganizationJobRow
          key={job.id}
          job={job}
          org={org}
          match={matchData.get(job.id) ?? null}
          matchLoading={matchLoading}
          userId={userId}
        />
      ))}
    </div>
  );
}
