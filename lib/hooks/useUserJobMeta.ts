'use client';

import { useState, useEffect, useRef } from 'react';
import { fetchMatchMapForJobs } from '@/lib/bulletin/match-map';
import { fetchBookmarkedJobIds } from '@/lib/bulletin/client-data';
import type { JobPosting, JobMatchData } from '@/lib/supabase';
import type { InitialBulletinData } from '@/lib/bulletin/types';

export function useUserJobMeta(
  userId: string | null,
  allJobs: JobPosting[],
  initialData?: InitialBulletinData
) {
  const [matchData, setMatchData] = useState<Map<string, JobMatchData>>(() => 
    new Map(Object.entries(initialData?.matchData ?? {}))
  );
  const [bookmarkedJobIds, setBookmarkedJobIds] = useState<Set<string>>(() => 
    new Set(initialData?.bookmarkedJobIds ?? [])
  );

  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!userId || allJobs.length === 0) {
      setMatchData(new Map());
      setBookmarkedJobIds(new Set());
      prevUserIdRef.current = userId;
      return;
    }

    if (prevUserIdRef.current === userId) return;
    prevUserIdRef.current = userId;

    let cancelled = false;
    const jobIds = allJobs.map((job) => job.id);

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
  }, [allJobs, userId]);

  return {
    matchData,
    setMatchData,
    bookmarkedJobIds,
    setBookmarkedJobIds,
  };
}
