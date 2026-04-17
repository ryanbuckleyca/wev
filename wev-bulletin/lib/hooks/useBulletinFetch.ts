'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { formatLastScrapeTime } from '@/lib/bulletin/client-data';
import type { JobPosting } from '@/lib/supabase';
import type { InitialBulletinData, SkillLabel } from '@/lib/bulletin/types';

const FETCH_TIMEOUT_MS = 10_000;

export function useBulletinFetch(
  locale: string,
  initialData?: InitialBulletinData,
  onDataLoaded?: (jobs: JobPosting[]) => void,
) {
  const t = useTranslations('home.errors');
  const requestIdRef = useRef(0);
  const hasInitialBulletinPayload = Array.isArray(initialData?.jobs);
  const shouldHydrateFullDataset = initialData?.isPartialHydration === true;
  const hasInitialRenderData = hasInitialBulletinPayload || shouldHydrateFullDataset;

  const [allJobs, setAllJobs] = useState<JobPosting[]>(() => initialData?.jobs ?? []);
  const [lastScrapeTime, setLastScrapeTime] = useState<string | null>(() =>
    initialData?.scrapeTime ? formatLastScrapeTime(initialData.scrapeTime, locale) : null,
  );
  const [skillLabels, setSkillLabels] = useState<Record<string, SkillLabel>>(
    () => initialData?.skillLabels ?? {},
  );
  const [loading, setLoading] = useState(!hasInitialRenderData);
  const [error, setError] = useState<string | null>(null);
  const [hasHydratedFullDataset, setHasHydratedFullDataset] = useState(
    () => hasInitialBulletinPayload && !shouldHydrateFullDataset,
  );

  const loadJobs = useCallback(async ({ resetPage, showLoading }: {
    resetPage: boolean;
    showLoading: boolean;
  }) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (showLoading) {
      setLoading(true);
    }
    setError(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(`/api/bulletin?locale=${locale}`, {
        signal: controller.signal,
        cache: 'no-cache',
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? t('loadFailed'));
      }

      const data = await response.json();
      if (requestId !== requestIdRef.current) return;

      const formattedTime = formatLastScrapeTime(data.lastScrapeTime, locale);
      setLastScrapeTime(formattedTime);
      setAllJobs(data.jobs ?? []);
      if (data.skillLabels) {
        setSkillLabels(data.skillLabels);
      }
      setLoading(false);
      setHasHydratedFullDataset(true);
      if (resetPage) {
        onDataLoaded?.(data.jobs ?? []);
      }
    } catch (fetchError) {
      if (requestId !== requestIdRef.current) return;
      console.error('Error fetching bulletin data:', fetchError);

      let message = t('loadFailed');
      if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
        message = t('timeout');
      } else if (fetchError instanceof Error) {
        message = fetchError.message;
      }

      setError(message);
      setLoading(false);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [locale, t, onDataLoaded]);

  const refresh = useCallback(
    async () =>
      loadJobs({
        resetPage: true,
        showLoading: true,
      }),
    [loadJobs],
  );

  const initialFetchDone = useRef(hasInitialRenderData && !shouldHydrateFullDataset);
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;
    void loadJobs({
      resetPage: false,
      showLoading: !hasInitialRenderData,
    });
  }, [loadJobs, hasInitialRenderData]);

  return {
    allJobs,
    setAllJobs,
    lastScrapeTime,
    skillLabels,
    setSkillLabels,
    loading,
    error,
    hasHydratedFullDataset,
    refresh,
  };
}
