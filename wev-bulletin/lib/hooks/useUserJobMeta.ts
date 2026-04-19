'use client';

import { useState, useEffect, useRef } from 'react';
import { fetchMatchMapForJobs } from '@/lib/bulletin/match-map';
import { fetchBookmarkedJobIds } from '@/lib/bulletin/client-data';
import type { JobPosting, JobMatchData } from '@/lib/supabase';
import type { InitialBulletinData } from '@/lib/bulletin/types';

export function useUserJobMeta(
  userId: string | null,
  jobsOnPage: JobPosting[],
  initialData?: InitialBulletinData,
) {
  const [matchData, setMatchData] = useState<Map<string, JobMatchData>>(
    () => new Map(Object.entries(initialData?.matchData ?? {})),
  );
  const [bookmarkedJobIds, setBookmarkedJobIds] = useState<Set<string>>(
    () => new Set(initialData?.bookmarkedJobIds ?? []),
  );

  const [currentUserId, setCurrentUserId] = useState(userId);
  const hydratedServerUserMetaRef = useRef(
    initialData?.userId === userId &&
      (initialData?.matchData !== undefined || initialData?.bookmarkedJobIds !== undefined),
  );

  // Reset state synchronously during render if the user identity changes.
  // This follows React's "Resetting state on prop change" pattern and
  // avoids the 'setState in useEffect' cascading render warning.
  if (userId !== currentUserId) {
    setCurrentUserId(userId);
    setMatchData(new Map());
    setBookmarkedJobIds(new Set());
  }

  useEffect(() => {
    // If no user or no jobs, there is nothing to fetch.
    // The state is already reset by the render-time sync above.
    if (!userId || jobsOnPage.length === 0) return;
    if (hydratedServerUserMetaRef.current) {
      hydratedServerUserMetaRef.current = false;
      return;
    }

    let cancelled = false;
    const jobIds = jobsOnPage.map((job) => job.id);

    void Promise.all([
      fetchMatchMapForJobs(userId, jobIds),
      fetchBookmarkedJobIds(userId, jobIds),
    ]).then(([matches, bookmarked]) => {
      if (cancelled) return;
      setMatchData(matches);
      setBookmarkedJobIds(bookmarked);
    });

    return () => {
      cancelled = true;
    };
  }, [jobsOnPage, userId]);

  return {
    matchData,
    setMatchData,
    bookmarkedJobIds,
    setBookmarkedJobIds,
  };
}
