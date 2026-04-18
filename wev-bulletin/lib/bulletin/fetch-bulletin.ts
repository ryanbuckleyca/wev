import 'server-only';

import { unstable_cache } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';
import { resolveSkillLabels } from '@/lib/resolve-skill-labels';
import normalizeJobsWithSource from '@/lib/normalize-job';
import type { JobMatchData, JobPosting } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase/profiles';
import {
  BULLETIN_ITEMS_PER_PAGE,
  type BulletinFilters,
  type JobSortOption,
  DATABASE_SORT_OPTIONS,
  MATCH_SORT_OPTIONS,
  filterJobs,
  sortJobs,
} from '@/lib/bulletin/job-query';
import { type BulletinFilterOptions } from '@/lib/bulletin/filter-options';
import {
  BULLETIN_CACHE_TAG,
  JOBS_SELECT_COLUMNS,
} from './constants';
import {
  getRecentJobsCutoffIso,
  applyFiltersToJobsQuery,
  applyDatabaseSort,
} from './query-builder';
import { type ParsedBulletinRequest, type BulletinSearchParams, parseBulletinRequest } from './parse-request';
import { fetchServerMatchData, type SerializedMatchData } from './user-data';

export interface BulletinQueryResult {
  jobs: JobPosting[];
  lastScrapeTime: string | null;
  skillLabels: Record<string, import('@/lib/resolve-skill-labels').SkillLabel>;
  filteredJobsCount: number;
  totalJobsCount: number;
  totalPages: number;
  currentPage: number;
  filterOptions?: BulletinFilterOptions;
}

interface QueryBulletinJobsOptions {
  locale: 'en' | 'fr';
  request: ParsedBulletinRequest;
  userId?: string | null;
  includeFilterOptions?: boolean;
  includeAllFilteredJobs?: boolean;
}

interface BuildInitialBulletinDataOptions {
  locale: 'en' | 'fr';
  searchParams: BulletinSearchParams;
  userId?: string | null;
  profile?: Profile | null;
  matchData?: SerializedMatchData;
  bookmarkedJobIds?: string[];
}

interface FilterOptionRow {
  organization: string | null;
  province: string | null;
  municipality: string | null;
  employment_type: string | null;
  sources?: { name?: string | null } | Array<{ name?: string | null }> | null;
}

function getSourceName(
  source: { name?: string | null } | Array<{ name?: string | null }> | null | undefined,
): string | null {
  if (Array.isArray(source)) {
    return source[0]?.name ?? null;
  }
  return source?.name ?? null;
}

function buildFilterOptionsFromRows(rows: FilterOptionRow[]): BulletinFilterOptions {
  const organizations = new Set<string>();
  const provinces = new Set<string>();
  const municipalitiesByProvince: Record<string, Set<string>> = {};
  const employmentTypes = new Set<string>();
  const sources = new Set<string>();

  for (const row of rows) {
    if (row.organization) organizations.add(row.organization);
    if (row.employment_type) employmentTypes.add(row.employment_type);

    const sourceName = getSourceName(row.sources ?? null);
    if (sourceName) sources.add(sourceName);

    if (!row.province) continue;

    provinces.add(row.province);
    if (!municipalitiesByProvince[row.province]) {
      municipalitiesByProvince[row.province] = new Set<string>();
    }

    if (row.municipality) {
      municipalitiesByProvince[row.province].add(row.municipality);
    }
  }

  const sortedMunicipalitiesByProvince: Record<string, string[]> = {};
  for (const province of Object.keys(municipalitiesByProvince).sort()) {
    sortedMunicipalitiesByProvince[province] = Array.from(municipalitiesByProvince[province]).sort();
  }

  return {
    organizations: Array.from(organizations).sort(),
    provinces: Array.from(provinces).sort(),
    municipalitiesByProvince: sortedMunicipalitiesByProvince,
    employmentTypes: Array.from(employmentTypes).sort(),
    sources: Array.from(sources).sort(),
  };
}

function shouldUseDatabasePagination(
  sortBy: JobSortOption,
  filters: BulletinFilters,
): boolean {
  return (
    DATABASE_SORT_OPTIONS.has(sortBy) &&
    filters.showJobsWithoutSalary &&
    filters.selectedSources.length === 0
  );
}

function shouldUseMatchSort(sortBy: JobSortOption) {
  return MATCH_SORT_OPTIONS.has(sortBy);
}

async function queryJobsWithDatabasePagination({
  request,
  includeAllFilteredJobs,
}: {
  request: ParsedBulletinRequest;
  includeAllFilteredJobs: boolean;
}): Promise<{
  jobs: JobPosting[];
  filteredJobsCount: number;
  totalPages: number;
  currentPage: number;
}> {
  const runQuery = async (page: number) => {
    let query: PostgrestFilterBuilder<any, any, any, string> = supabaseServer
      .from('jobs')
      .select(JOBS_SELECT_COLUMNS, { count: 'exact' });
    query = applyFiltersToJobsQuery(query, request.filters);
    query = applyDatabaseSort(query, request.sortBy);

    if (!includeAllFilteredJobs) {
      const start = (page - 1) * BULLETIN_ITEMS_PER_PAGE;
      const end = start + BULLETIN_ITEMS_PER_PAGE - 1;
      query = query.range(start, end);
    }

    return await query;
  };

  let resolvedPage = Math.max(1, request.currentPage);
  const result = await runQuery(resolvedPage);
  let { data } = result;
  const { error, count } = result;

  if (error) {
    throw new Error(error.message);
  }

  const filteredJobsCount = count ?? 0;
  const totalPages = Math.ceil(filteredJobsCount / BULLETIN_ITEMS_PER_PAGE);

  if (!includeAllFilteredJobs && totalPages > 0 && resolvedPage > totalPages) {
    resolvedPage = totalPages;
    const rerun = await runQuery(resolvedPage);
    if (rerun.error) {
      throw new Error(rerun.error.message);
    }
    data = rerun.data;
  }

  return {
    jobs: normalizeJobsWithSource(data) as unknown as JobPosting[],
    filteredJobsCount,
    totalPages,
    currentPage: totalPages === 0 ? 1 : resolvedPage,
  };
}

async function queryJobsWithInMemorySort({
  request,
  userId,
  includeAllFilteredJobs,
}: {
  request: ParsedBulletinRequest;
  userId: string | null;
  includeAllFilteredJobs: boolean;
}): Promise<{
  jobs: JobPosting[];
  filteredJobsCount: number;
  totalPages: number;
  currentPage: number;
}> {
  let query = supabaseServer.from('jobs').select(JOBS_SELECT_COLUMNS);
  query = applyFiltersToJobsQuery(query, request.filters);

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const jobs = normalizeJobsWithSource(data) as unknown as JobPosting[];
  const filteredJobs = filterJobs(jobs, request.filters);

  let matchMap = new Map<string, JobMatchData>();
  if (userId && shouldUseMatchSort(request.sortBy)) {
    const serializedMatchData = await fetchServerMatchData(userId);
    matchMap = new Map(Object.entries(serializedMatchData));
  }

  const sortedJobs = sortJobs(filteredJobs, request.sortBy, matchMap);
  const totalPages = Math.ceil(sortedJobs.length / BULLETIN_ITEMS_PER_PAGE);
  const resolvedPage = totalPages === 0 ? 1 : Math.min(Math.max(request.currentPage, 1), totalPages);

  const pageJobs = includeAllFilteredJobs
    ? sortedJobs
    : sortedJobs.slice(
        (resolvedPage - 1) * BULLETIN_ITEMS_PER_PAGE,
        resolvedPage * BULLETIN_ITEMS_PER_PAGE,
      );

  return {
    jobs: pageJobs,
    filteredJobsCount: sortedJobs.length,
    totalPages,
    currentPage: resolvedPage,
  };
}

const fetchBulletinMeta = unstable_cache(
  async () => {
    const [scrapeResult, countResult] = await Promise.all([
      supabaseServer
        .from('scrape_runs')
        .select('run_at')
        .order('run_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseServer
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .gte('date_posted', getRecentJobsCutoffIso()),
    ]);

    if (scrapeResult.error) throw new Error(scrapeResult.error.message);
    if (countResult.error) throw new Error(countResult.error.message);

    return {
      lastScrapeTime: scrapeResult.data?.run_at ?? null,
      totalJobsCount: countResult.count ?? 0,
    };
  },
  [BULLETIN_CACHE_TAG, 'meta'],
  { tags: [BULLETIN_CACHE_TAG], revalidate: 300 },
);

const fetchCachedFilterOptions = unstable_cache(
  async (): Promise<BulletinFilterOptions> => {
    const { data, error } = await supabaseServer
      .from('jobs')
      .select('organization, province, municipality, employment_type, sources(name), date_posted')
      .gte('date_posted', getRecentJobsCutoffIso());

    if (error) throw new Error(error.message);

    return buildFilterOptionsFromRows((data ?? []) as unknown as FilterOptionRow[]);
  },
  [BULLETIN_CACHE_TAG, 'filter-options'],
  { tags: [BULLETIN_CACHE_TAG], revalidate: 300 },
);

export async function queryBulletinJobs({
  locale,
  request,
  userId = null,
  includeFilterOptions = false,
  includeAllFilteredJobs = false,
}: QueryBulletinJobsOptions): Promise<BulletinQueryResult> {
  const [bulletinMeta, jobsResult, filterOptions] = await Promise.all([
    fetchBulletinMeta(),
    shouldUseDatabasePagination(request.sortBy, request.filters)
      ? queryJobsWithDatabasePagination({ request, includeAllFilteredJobs })
      : queryJobsWithInMemorySort({ request, userId, includeAllFilteredJobs }),
    includeFilterOptions ? fetchCachedFilterOptions() : Promise.resolve(undefined),
  ]);

  const labelMap = await resolveSkillLabels(supabaseServer, jobsResult.jobs, locale);

  return {
    jobs: jobsResult.jobs,
    lastScrapeTime: bulletinMeta.lastScrapeTime,
    skillLabels: Object.fromEntries(labelMap),
    filteredJobsCount: jobsResult.filteredJobsCount,
    totalJobsCount: bulletinMeta.totalJobsCount,
    totalPages: jobsResult.totalPages,
    currentPage: jobsResult.currentPage,
    filterOptions,
  };
}

function pickRecordKeys<T>(record: Record<string, T>, keys: Set<string>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => keys.has(key)),
  );
}

export async function buildInitialBulletinData({
  locale,
  searchParams,
  userId = null,
  profile = null,
  matchData,
  bookmarkedJobIds,
}: BuildInitialBulletinDataOptions) {
  const serverRequest = parseBulletinRequest(searchParams, profile, userId);

  const queryResult = await queryBulletinJobs({
    locale,
    request: serverRequest,
    userId: userId ?? null,
    includeFilterOptions: true,
  });

  const visibleJobIds = new Set(queryResult.jobs.map((job) => job.id));

  return {
    jobs: queryResult.jobs,
    scrapeTime: queryResult.lastScrapeTime,
    skillLabels: queryResult.skillLabels,
    matchData: matchData ? pickRecordKeys(matchData, visibleJobIds) : undefined,
    bookmarkedJobIds: bookmarkedJobIds?.filter((jobId) => visibleJobIds.has(jobId)),
    filteredJobsCount: queryResult.filteredJobsCount,
    totalJobsCount: queryResult.totalJobsCount,
    totalPages: queryResult.totalPages,
    filterOptions: queryResult.filterOptions,
  };
}
