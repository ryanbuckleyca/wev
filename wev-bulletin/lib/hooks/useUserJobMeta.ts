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
  const hasHydratedServerMeta =
    initialData?.userId === userId &&
    (initialData?.matchData !== undefined || initialData?.bookmarkedJobIds !== undefined);

  const [matchData, setMatchData] = useState<Map<string, JobMatchData>>(
    () => new Map(Object.entries(initialData?.matchData ?? {})),
  );
  const [bookmarkedJobIds, setBookmarkedJobIds] = useState<Set<string>>(
    () => new Set(initialData?.bookmarkedJobIds ?? []),
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [currentUserId, setCurrentUserId] = useState(userId);
  const hydratedServerUserMetaRef = useRef(hasHydratedServerMeta);

  // Reset state synchronously during render if the user identity changes.
  // This follows React's "Resetting state on prop change" pattern and
  // avoids the 'setState in useEffect' cascading render warning.
  if (userId !== currentUserId) {
    setCurrentUserId(userId);
    setMatchData(new Map());
    setBookmarkedJobIds(new Set());
    setIsLoading(false);
  }

  useEffect(() => {
    // If no user or no jobs, there is nothing to fetch.
    // The state is already reset by the render-time sync above.
    if (!userId || jobsOnPage.length === 0) {
      // Explicitly clear loading state in case a fetch was in-flight.
      // The cleanup's cancellation guard would otherwise prevent .finally() from running.
      setIsLoading(false);
      return;
    }
    if (hydratedServerUserMetaRef.current) {
      hydratedServerUserMetaRef.current = false;
      return;
    }

    let cancelled = false;
    const jobIds = jobsOnPage.map((job) => job.id);
    // Safe to set state synchronously at the start of effect with cancellation guard
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);

    void Promise.all([fetchMatchMapForJobs(userId, jobIds), fetchBookmarkedJobIds(userId, jobIds)])
      .then(([matches, bookmarked]) => {
        if (cancelled) return;
        setMatchData(matches);
        setBookmarkedJobIds(bookmarked);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
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
    isLoading,
  };
}
