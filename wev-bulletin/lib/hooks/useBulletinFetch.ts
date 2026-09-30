'use client';

import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
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
  'type',
  'sector',
  'employment',
  'source',
  'nonSse',
  'salary',
  'posted',
  'sort',
  'page',
] as const;

/** Stable key for the active bulletin fetch (locale, filters, sort, page). */
function buildFetchKey(
  locale: string,
  filters: UseBulletinDataOptions['filters'],
  sortBy: string,
  currentPage: number,
): string {
  return JSON.stringify({ locale, filters, sortBy, currentPage });
}

/** Client bulletin list fetch with SSR hydration discard for signed-in session cookies. */
export function useBulletinFetch(
  locale: string,
  options: UseBulletinDataOptions,
  initialData?: InitialBulletinData,
) {
  const t = useTranslations('home.errors');
  const searchParams = useSearchParams();
  const requestIdRef = useRef(0);
  const { filters, sortBy, currentPage, filtersReady, sessionCookie = false } = options;

  const hasInitialData = !!initialData;

  // Captured once at mount: these decide whether the SSR payload matches the
  // first view we will render.
  const ssrHadUser = useRef(!!initialData?.userId).current;
  const urlBareAtMount = useRef(!BULLETIN_URL_KEYS.some((key) => searchParams?.has(key))).current;

  // Hydrate anonymous SSR jobs on the first render so we match cached HTML.
  // If a session cookie is found before paint, the layout effect below discards
  // them and shows a skeleton until the personalized fetch completes.
  const hydrateInitial = hasInitialData && urlBareAtMount && !ssrHadUser;

  const fetchKey = useMemo(
    () => buildFetchKey(locale, filters, sortBy, currentPage),
    [locale, filters, sortBy, currentPage],
  );

  // Key of the data currently in state. Differs from fetchKey while a new
  // filter/page request is in flight — drives the list skeleton on the same
  // render as the URL change (before the fetch effect runs).
  const [completedFetchKey, setCompletedFetchKey] = useState<string | null>(() => {
    const hydrate =
      !!initialData &&
      !initialData.userId &&
      !BULLETIN_URL_KEYS.some((key) => searchParams?.has(key));
    return hydrate ? buildFetchKey(locale, filters, sortBy, currentPage) : null;
  });

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
  const discardedSsrForSessionRef = useRef(false);

  // Before paint: signed-in users must not see the anonymous SSR list.
  useLayoutEffect(() => {
    if (sessionCookie !== true || discardedSsrForSessionRef.current) return;
    discardedSsrForSessionRef.current = true;
    setJobsOnPage([]);
    setTotalMatchingJobs(0);
    setCompletedFetchKey(null);
    setLoading(true);
    setError(null);
  }, [sessionCookie]);

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    // Always show the list skeleton while fetching a new filter/page result so
    // users don't briefly see the previous page's jobs and think nothing changed.
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
      // nonSse=true means "include non-SSE jobs"; absence means SSE-only (the default)
      if (filters.showNonSse) params.set('nonSse', 'true');
      if (filters.showJobsWithoutSalary) params.set('nosal', 'true');

      filters.selectedOrganizations.forEach((o) => params.append('orgs', o));
      filters.selectedOrgTypes.forEach((t) => params.append('types', t));
      filters.selectedSectors.forEach((s) => params.append('sectors', s));
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
      setCompletedFetchKey(fetchKey);
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
      // Settle this fetchKey even on failure so isStale clears and the UI is not
      // stuck with a permanent loading indicator alongside the error.
      setCompletedFetchKey(fetchKey);
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
    if (completedFetchKey === fetchKey) return;
    void refreshRef.current();
  }, [filtersReady, fetchKey, completedFetchKey]);

  // Skeleton whenever the on-screen jobs don't match the active filter/page key
  // (including the gap between a URL change and the fetch effect starting).
  // Do not gate on `!filtersReady` alone: anonymous SSR/CDN HTML must emit the
  // hydrated jobs shell while `sessionCookie` is still null (cookie unread) or
  // false. Signed-in users wait via `awaitingSessionPersonalization` instead.
  const isStale = completedFetchKey !== fetchKey;
  const awaitingSessionPersonalization = sessionCookie === true && !filtersReady;
  const effectiveLoading = loading || isStale || awaitingSessionPersonalization;

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
