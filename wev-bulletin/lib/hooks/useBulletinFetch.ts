'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { formatLastScrapeTime } from '@/lib/bulletin/client-data';
import type { JobPosting } from '@/lib/supabase';
import type { InitialBulletinData, SkillLabel, UseBulletinDataOptions } from '@/lib/bulletin/types';

const FETCH_TIMEOUT_MS = 10_000;

export function useBulletinFetch(
  locale: string,
  options: UseBulletinDataOptions,
  initialData?: InitialBulletinData,
) {
  const t = useTranslations('home.errors');
  const requestIdRef = useRef(0);
  const hasInitialData = !!initialData;

  const [jobsOnPage, setJobsOnPage] = useState<JobPosting[]>(() => initialData?.jobs ?? []);
  const [totalMatchingJobs, setTotalMatchingJobs] = useState<number>(
    initialData?.total ?? initialData?.jobs?.length ?? 0,
  );
  const [availableJobsCount, setAvailableJobsCount] = useState<number>(
    initialData?.totalAvailable ?? 0,
  );
  const [lastScrapeTime, setLastScrapeTime] = useState<string | null>(() =>
    initialData?.scrapeTime ? formatLastScrapeTime(initialData.scrapeTime, locale) : null,
  );
  const [skillLabels, setSkillLabels] = useState<Record<string, SkillLabel>>(
    () => initialData?.skillLabels ?? {},
  );
  const [loading, setLoading] = useState(!hasInitialData);
  const [error, setError] = useState<string | null>(null);

  const { filters, sortBy, currentPage } = options;

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const params = new URLSearchParams({ locale });
      params.set('page', String(currentPage));
      params.set('sortBy', sortBy);
      params.set('postedWithin', filters.postedWithin);

      if (filters.searchQuery) params.set('q', filters.searchQuery);
      if (filters.showOnlySse) params.set('sse', 'true');
      if (filters.showJobsWithoutSalary) params.set('nosal', 'true');

      filters.selectedOrganizations.forEach((o) => params.append('orgs', o));
      filters.selectedProvinces.forEach((p) => params.append('provs', p));
      filters.selectedMunicipalities.forEach((m) => params.append('munis', m));
      filters.selectedEmploymentTypes.forEach((e) => params.append('emps', e));
      filters.selectedSources.forEach((s) => params.append('srcs', s));
      filters.selectedWorkTypes.forEach((w) => params.append('works', w));

      const response = await fetch(`/api/bulletin?${params.toString()}`, {
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
      const nextTotal = data.total ?? 0;
      const nextAvailable = data.totalAvailable ?? 0;
      setJobsOnPage(data.jobs ?? []);
      setTotalMatchingJobs(nextTotal);
      setAvailableJobsCount(nextAvailable);
      if (data.skillLabels) {
        setSkillLabels(data.skillLabels);
      }
      setLoading(false);
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
  }, [locale, t, filters, sortBy, currentPage]);

  const initialFetchDone = useRef(hasInitialData);
  useEffect(() => {
    if (initialFetchDone.current) {
      initialFetchDone.current = false;
      return;
    }
    void refresh();
  }, [refresh]);

  return {
    jobsOnPage,
    setJobsOnPage,
    totalMatchingJobs,
    availableJobsCount,
    lastScrapeTime,
    skillLabels,
    setSkillLabels,
    loading,
    error,
    refresh,
  };
}
