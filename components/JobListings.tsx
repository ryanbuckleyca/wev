'use client';

import { useState, useContext } from 'react';
import { useTranslations } from 'next-intl';
import { JobPosting, JobMatchData } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase/profiles';
import JobCard from './JobCard';
import StyledLink from './StyledLink';
import { BulletinFilterContext } from '@/contexts/BulletinFilterContext';
import LoadingIndicator from './LoadingIndicator';
import { JOB_BOARD_TEST_IDS } from '@/lib/testing/job-board-contract';

interface JobListingsProps {
  jobs: JobPosting[];
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  userId: string | null;
  profile: Profile | null;
  onJobSseChange?: (jobId: string, isSse: boolean) => void;
  onJobBookmarkChange?: (job: JobPosting, bookmarked: boolean) => void;
  matchData?: Map<string, JobMatchData>;
  bookmarkedJobIds?: Set<string>;
  skillLabels?: Record<string, import('@/lib/resolve-skill-labels').SkillLabel>;
  totalJobsCount?: number;
}

export default function JobListings({
  jobs,
  loading,
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

  // Conditionally consume context so we don't break the Bookmarks page which isn't wrapped in it.
  const filterContext = useContext(BulletinFilterContext);
  const allExpanded = filterContext?.allJobsExpanded ?? true;
  const selectedWorkTypes = filterContext?.selectedWorkTypes;

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
    return <LoadingIndicator fullScreen={false} message={t('jobListings.loading')} />;
  }

  if (!loading && jobs.length === 0) {
    const hasFilters = filterContext?.hasAnyFilters;
    const hasHiddenJobs = (totalJobsCount ?? 0) > 0;
    const showFilterClear = hasFilters && hasHiddenJobs;

    return (
      <div
        className="bg-card border border-border rounded-wev-card p-12 text-center flex flex-col items-center justify-center gap-4"
        data-testid={JOB_BOARD_TEST_IDS.emptyState}
      >
        <p className="text-foreground text-lg">{t('jobListings.noJobs')}</p>
        
        {showFilterClear && (
          <div className="flex flex-col items-center gap-6 mt-2 max-w-md w-full">
            <p className="text-muted-foreground">
              {t('jobListings.showingFiltered', { showing: 0, total: totalJobsCount ?? 0 })}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
              <button
                type="button"
                onClick={filterContext?.clearAllFilters}
                className="wev-btn wev-btn-secondary w-full sm:w-auto"
              >
                {t('jobListings.clearFilters')}
              </button>
              {userId && (
                <StyledLink href="/profile" className="wev-btn wev-btn-primary w-full sm:w-auto">
                  {t('filters.workType.profileLink')}
                </StyledLink>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {loading && jobs.length > 0 && (
        <div className="flex items-center justify-center py-4">
          <LoadingIndicator fullScreen={false} message={t('jobListings.loading')} />
        </div>
      )}

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
            initialBookmarked={bookmarkedJobIds?.has(job.id) ?? false}
            selectedWorkTypes={selectedWorkTypes}
            skillLabels={skillLabels}
          />
        ))}
      </div>
    </div>
  );
}
