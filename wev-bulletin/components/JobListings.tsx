'use client';

import { useState, useContext } from 'react';
import { useTranslations } from 'next-intl';
import { JobPosting, JobMatchData } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase/profiles';
import JobCard from './JobCard';
import LinkButton from './LinkButton';
import ListEmptyState from './ListEmptyState';
import { BulletinFilterContext } from '@/contexts/BulletinFilterContext';
import CardListSkeleton from './CardListSkeleton';
import { JOB_BOARD_TEST_IDS } from '@/lib/testing/job-board-contract';

interface JobListingsProps {
  jobs: JobPosting[];
  loading: boolean;
  userMetaLoading?: boolean;
  error: string | null;
  isAdmin: boolean;
  userId: string | null;
  profile: Profile | null;
  onJobSseChange?: (jobId: string, isSse: boolean) => void;
  onJobBookmarkChange?: (job: JobPosting, bookmarked: boolean) => void;
  matchData?: Map<string, JobMatchData>;
  bookmarkedJobIds?: Set<string>;
  skillLabels?: Record<string, import('@/lib/resolve-skill-labels').SkillLabel>;
  totalJobsCount: number;
}

export default function JobListings({
  jobs,
  loading,
  userMetaLoading = false,
  error,
  isAdmin,
  userId,
  profile,
  onJobSseChange,
  onJobBookmarkChange,
  matchData,
  bookmarkedJobIds,
  skillLabels,
  totalJobsCount,
}: JobListingsProps) {
  const t = useTranslations();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const filterContext = useContext(BulletinFilterContext);
  const allExpanded = filterContext?.allJobsExpanded ?? true;
  const selectedWorkTypes = filterContext?.selectedWorkTypes;
  const selectedLanguages = filterContext?.selectedLanguages;

  const handleSseToggle = async (job: JobPosting) => {
    const newValue = !job.is_sse;
    setUpdatingId(job.id);
    try {
      const res = await fetch(`/api/bulletin/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_sse: newValue }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to update');
      }
      onJobSseChange?.(job.id, newValue);
    } catch (err) {
      console.error('Failed to update is_sse:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  if (error) {
    return (
      <div className="bg-wev-destructive-tint border border-destructive rounded-wev-card p-4 text-destructive-foreground">
        <p className="font-semibold">{t('jobListings.error')}</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (loading && jobs.length === 0) {
    return <CardListSkeleton />;
  }

  if (!loading && jobs.length === 0) {
    return (
      <ListEmptyState
        emptyMessage={t('jobListings.noJobs')}
        filteredMessage={t('jobListings.showingFiltered', { total: totalJobsCount })}
        hasFilters={!!filterContext?.hasAnyFilters}
        totalAvailable={totalJobsCount}
        onClearFilters={filterContext?.clearAllFilters}
        clearFiltersLabel={t('jobListings.clearFilters')}
        secondaryAction={
          userId ? (
            <LinkButton href="/profile" variant="primary" className="w-full sm:w-auto">
              {t('filters.workType.profileLink')}
            </LinkButton>
          ) : undefined
        }
        testId={JOB_BOARD_TEST_IDS.emptyState}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-6">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            isAdmin={isAdmin}
            userId={userId}
            profile={profile}
            onSseToggle={handleSseToggle}
            onBookmarkToggle={onJobBookmarkChange}
            updatingId={updatingId}
            initialExpanded={allExpanded}
            match={matchData?.get(job.id)}
            matchLoading={userMetaLoading}
            initialBookmarked={bookmarkedJobIds?.has(job.id) ?? false}
            selectedWorkTypes={selectedWorkTypes}
            selectedLanguages={selectedLanguages}
            skillLabels={skillLabels}
          />
        ))}
      </div>
    </div>
  );
}
