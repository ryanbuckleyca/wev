'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import JobListings from '@/components/JobListings';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';
import { useProfile } from '@/contexts/ProfileContext';
import LoadingState from '@/components/LoadingState';
import PageLayout from '@/components/PageLayout';
import type { JobPosting, JobMatchData } from '@/lib/supabase';
import { fetchMatchMapForJobs } from '@/lib/bulletin/match-map';

export default function BookmarksPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { user, loading } = useRequireAuth();
  const { profile } = useProfile();
  const [jobs, setJobs] = useState<JobPosting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matchData, setMatchData] = useState<Map<string, JobMatchData>>(new Map());

  useEffect(() => {
    if (!user) return;

    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/bookmarks?locale=${locale}`, { cache: 'no-store' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || t('bookmarks.loadFailed'));
        }

        const { jobs: bookmarkedJobs } = await res.json();
        if (!mounted) return;

        setJobs(bookmarkedJobs);

        // Batch-fetch match data for bookmarked jobs
        if (bookmarkedJobs?.length > 0) {
          const matchMap = await fetchMatchMapForJobs(
            user.id,
            bookmarkedJobs.map((job: { id: string }) => job.id),
          );
          if (mounted) {
            setMatchData(matchMap);
          }
        } else if (mounted) {
          setMatchData(new Map<string, JobMatchData>());
        }
      } catch (err) {
        console.error('Failed to load bookmarks:', err);
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user, locale, t]);

  if (loading) return <LoadingState message={t('common.loading')} />;

  if (!user) {
    return null;
  }

  return (
    <PageLayout>
      <div>
        <h1 className="text-2xl font-semibold mb-2">{t('bookmarks.title')}</h1>

        {error && (
          <div className="bg-wev-destructive-tint border border-destructive rounded-wev-card p-4 text-destructive-foreground mb-4">
            <p className="font-semibold">{t('bookmarks.error')}</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {jobs === null ? (
          <LoadingState message={t('common.loading')} />
        ) : jobs.length === 0 ? (
          <div className="bg-card border border-border rounded-wev-card p-8 text-center">
            <p className="text-foreground">{t('bookmarks.noBookmarks')}</p>
          </div>
        ) : (
          <JobListings
            jobs={jobs}
            loading={false}
            error={null}
            profile={profile}
            matchData={matchData}
            bookmarkedJobIds={new Set(jobs.map((j: { id: string }) => j.id))}
            onJobBookmarkChange={(job, bookmarked) => {
              if (!bookmarked) setJobs((prev) => (prev ?? []).filter((j) => j.id !== job.id));
            }}
          />
        )}
      </div>
    </PageLayout>
  );
}
