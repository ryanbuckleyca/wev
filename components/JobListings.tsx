'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { JobPosting, JobMatchData } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase/profiles';
import JobCard from './JobCard';
import { useAuth } from '@/contexts/AuthContext';
import { BulletinFilterContext } from '@/contexts/BulletinFilterContext';
import { useContext } from 'react';
import LoadingIndicator from './LoadingIndicator';

interface JobListingsProps {
  jobs: JobPosting[];
  loading: boolean;
  error: string | null;
  profile: Profile | null;
  onJobSseChange?: (jobId: string, isSse: boolean) => void;
  onJobBookmarkChange?: (job: JobPosting, bookmarked: boolean) => void;
  matchData?: Map<string, JobMatchData>;
  bookmarkedJobIds?: Set<string>;
  skillLabels?: Record<string, import('@/lib/resolve-skill-labels').SkillLabel>;
}

export default function JobListings({
  jobs,
  loading,
  error,
  profile,
  onJobSseChange,
  onJobBookmarkChange,
  matchData,
  bookmarkedJobIds,
  skillLabels,
}: JobListingsProps) {
  const t = useTranslations();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const { role } = useAuth();

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
    return (
      <div className="bg-card border border-border rounded-wev-card p-8 text-center">
        <p className="text-foreground">{t('jobListings.noJobs')}</p>
      </div>
    );
  }

  const isAdmin = role === 'admin';

  return (
    <div className="space-y-4">
      {loading && jobs.length > 0 && (
        <div className="flex items-center justify-center py-4">
          <LoadingIndicator fullScreen={false} message={t('jobListings.loading')} />
        </div>
      )}

      <div className="space-y-6" data-testid="job-card-list">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            isAdmin={isAdmin}
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
