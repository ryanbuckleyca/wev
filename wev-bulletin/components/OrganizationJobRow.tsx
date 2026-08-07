'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { getWorkTypeLabel, labelize } from '@/lib/bulletin/filter-labels';
import {
  buildJobMatchTooltipProps,
  buildProfileMatchPreferences,
  buildRoundedMatchScores,
  buildSkillLabelMaps,
} from '@/lib/bulletin/job-match-display';
import { fetchMatchMapForJobs } from '@/lib/bulletin/match-map';
import { safeUrl } from '@/lib/url';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import type { OrgJobPosting } from '@/lib/organizations/types';
import type { JobMatchData } from '@/lib/supabase';
import CardFooter from './CardFooter';
import MatchDetailsTooltip from './MatchDetailsTooltip';

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

  const hasFooter = skills.length > 0 || values.length > 0;
  if (!hasFooter) return null;

  return (
    <div className="mt-3 pt-3 border-t border-border">
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
        fadeBackground="var(--card)"
        workType={job.work_type as 'remote' | 'hybrid' | 'office' | undefined}
        selectedWorkTypes={profile?.work_types ?? []}
        isLoggedIn={!!userId}
      />
    </div>
  );
}

export default function OrganizationJobRow({
  job,
  match,
  matchLoading = false,
  userId = null,
}: {
  job: OrgJobPosting;
  match?: JobMatchData | null;
  matchLoading?: boolean;
  userId?: string | null;
}) {
  const t = useTranslations();
  const locale = useLocale();

  let formattedDate = '';
  if (job.date_posted) {
    const date = new Date(job.date_posted);
    if (!isNaN(date.getTime())) {
      formattedDate = new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
    }
  }

  const url = safeUrl(job.listing_url);

  return (
    <article className="border border-border rounded-wev-card p-4 transition-colors hover:bg-muted/50">
      <a
        href={url ?? undefined}
        {...(url ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className={`block group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2${url ? '' : ' pointer-events-none opacity-70'}`}
      >
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold text-lg text-primary-text group-hover:underline">
            {job.job_title}
          </h3>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {job.location && (
              <div className="flex items-center gap-1.5">
                <span>{job.location}</span>
              </div>
            )}

            {job.work_type && (
              <div className="flex items-center gap-1.5">
                <span>{getWorkTypeLabel(job.work_type, t)}</span>
              </div>
            )}

            {job.employment_type && (
              <div className="flex items-center gap-1.5">
                <span>{labelize(job.employment_type)}</span>
              </div>
            )}

            {formattedDate && (
              <div className="flex items-center gap-1.5 ml-auto">
                <span>{formattedDate}</span>
              </div>
            )}
          </div>
        </div>
      </a>

      <JobSkillFooter job={job} match={match} matchLoading={matchLoading} userId={userId} />
    </article>
  );
}

/** Client list that hydrates job_matches for the visible org jobs. */
export function OrganizationJobsList({ jobs }: { jobs: OrgJobPosting[] }) {
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
          match={matchData.get(job.id) ?? null}
          matchLoading={matchLoading}
          userId={userId}
        />
      ))}
    </div>
  );
}
