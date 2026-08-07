'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { formatLastScrapeTime } from '@/lib/bulletin/client-data';
import type { JobPosting } from '@/lib/supabase';
import type { BulletinFilterOptions } from '@/lib/bulletin/filter-options';
import type { InitialBulletinData, SkillLabel, UseBulletinDataOptions } from '@/lib/bulletin/types';

const FETCH_TIMEOUT_MS = 10_000;

// Presence of any of these in the URL means the first view is not the plain
// default/unfiltered SSR view, so SSR jobs should not be hydrated as-is.
const BULLETIN_URL_KEYS = [
  'workType',
  'province',
  'municipality',
  'lang',
  'langs',
  'q',
  'org',
  'employment',
  'source',
  'nonSse',
  'salary',
  'posted',
  'sort',
  'page',
] as const;

function buildFetchKey(
  locale: string,
  filters: UseBulletinDataOptions['filters'],
  sortBy: string,
  currentPage: number,
): string {
  return JSON.stringify({ locale, filters, sortBy, currentPage });
}

export function useBulletinFetch(
  locale: string,
  options: UseBulletinDataOptions,
  initialData?: InitialBulletinData,
) {
  const t = useTranslations('home.errors');
  const searchParams = useSearchParams();
  const requestIdRef = useRef(0);
  const { filters, sortBy, currentPage, filtersReady } = options;

  const hasInitialData = !!initialData;

  // Captured once at mount: these decide whether the SSR payload matches the
  // first view we will render.
  const isLoggedInAtMount = useRef(!!initialData?.userId).current;
  const urlBareAtMount = useRef(!BULLETIN_URL_KEYS.some((key) => searchParams?.has(key))).current;

  // Hydrate SSR jobs only for an anonymous, unfiltered load — the one case where
  // the server payload equals the first client view. Logged-in users may have
  // profile defaults seeded into the URL, and a filtered URL needs its own fetch;
  // in both cases showing the SSR (unfiltered) set first would flash/strip.
  const hydrateInitial = hasInitialData && urlBareAtMount && !isLoggedInAtMount;

  const fetchKey = useMemo(
    () => buildFetchKey(locale, filters, sortBy, currentPage),
    [locale, filters, sortBy, currentPage],
  );

  // When we hydrate SSR jobs they already represent this fetchKey, so the first
  // effect run won't refetch the identical set.
  const lastFetchedKeyRef = useRef<string | null>(hydrateInitial ? fetchKey : null);

  const [jobsOnPage, setJobsOnPage] = useState<JobPosting[]>(() =>
    hydrateInitial ? (initialData?.jobs ?? []) : [],
  );
  const [totalMatchingJobs, setTotalMatchingJobs] = useState<number>(() =>
    hydrateInitial ? (initialData?.total ?? initialData?.jobs?.length ?? 0) : 0,
  );
  const [availableJobsCount, setAvailableJobsCount] = useState<number>(
    () => initialData?.totalAvailable ?? 0,
  );
  const [lastScrapeTime, setLastScrapeTime] = useState<string | null>(() =>
    initialData?.scrapeTime ? formatLastScrapeTime(initialData.scrapeTime, locale) : null,
  );
  const [skillLabels, setSkillLabels] = useState<Record<string, SkillLabel>>(
    () => initialData?.skillLabels ?? {},
  );
  const [filterOptions, setFilterOptions] = useState<BulletinFilterOptions>(
    () =>
      initialData?.filterOptions ?? {
        organizations: [],
        provinces: [],
        municipalitiesByProvince: {},
        employmentTypes: [],
        sources: [],
        languages: [],
      },
  );
  const [loading, setLoading] = useState(() => !hydrateInitial);
  const [error, setError] = useState<string | null>(null);
  const jobsOnPageRef = useRef(jobsOnPage);
  jobsOnPageRef.current = jobsOnPage;

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    // Only show the skeleton when there's nothing on screen yet. When jobs are
    // already displayed, refetch in the background (stale-while-revalidate) so
    // the list never flashes to a skeleton.
    if (jobsOnPageRef.current.length === 0) {
      setLoading(true);
    }
    setError(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const params = new URLSearchParams({ locale });
      params.set('page', String(currentPage));
      params.set('sortBy', sortBy);
      params.set('postedWithin', filters.postedWithin);

      if (filters.searchQuery) params.set('q', filters.searchQuery);
      if (filters.showJobsWithoutSalary) params.set('nosal', 'true');

      filters.selectedOrganizations.forEach((o) => params.append('orgs', o));
      filters.selectedProvinces.forEach((p) => params.append('provs', p));
      filters.selectedMunicipalities.forEach((m) => params.append('munis', m));
      filters.selectedEmploymentTypes.forEach((e) => params.append('emps', e));
      filters.selectedSources.forEach((s) => params.append('srcs', s));
      filters.selectedWorkTypes.forEach((w) => params.append('works', w));
      filters.selectedLanguages.forEach((l) => params.append('langs', l));

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
      setJobsOnPage(data.jobs ?? []);
      setTotalMatchingJobs(data.total ?? 0);
      setAvailableJobsCount(data.totalAvailable ?? 0);
      if (data.skillLabels) {
        setSkillLabels(data.skillLabels);
      }
      if (data.filterOptions) {
        setFilterOptions(data.filterOptions);
      }
      lastFetchedKeyRef.current = fetchKey;
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
  }, [locale, t, filters, sortBy, currentPage, fetchKey]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Fetch once the filter state is final (URL settled / profile defaults seeded)
  // and the active query differs from the last one we fetched. Deduping by
  // fetchKey makes transient filter "settling" cheap and idempotent.
  useEffect(() => {
    if (!filtersReady) return;
    if (lastFetchedKeyRef.current === fetchKey) return;
    void refreshRef.current();
  }, [filtersReady, fetchKey]);

  // Skeleton until the first result for the current view is on screen. Once jobs
  // are displayed, background refetches keep the old list visible (no flash).
  const effectiveLoading = jobsOnPage.length === 0 && (loading || !filtersReady);

  return {
    jobsOnPage,
    setJobsOnPage,
    totalMatchingJobs,
    availableJobsCount,
    lastScrapeTime,
    skillLabels,
    setSkillLabels,
    filterOptions,
    loading: effectiveLoading,
    error,
    refresh,
  };
}
