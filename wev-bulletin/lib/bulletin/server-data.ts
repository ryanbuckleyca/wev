import 'server-only';

import { unstable_cache } from 'next/cache';
import {
  BULLETIN_ITEMS_PER_PAGE,
  JOB_SORT_OPTIONS,
  POSTED_WITHIN_FILTER_OPTIONS,
  filterJobs,
  sortJobs,
  type BulletinFilters,
  type JobSortOption,
} from '@/lib/bulletin/job-query';
import { type BulletinFilterOptions } from '@/lib/bulletin/filter-options';
import { supabaseServer } from '@/lib/supabase-server';
import normalizeJobsWithSource from '@/lib/normalize-job';
import { resolveSkillLabels } from '@/lib/resolve-skill-labels';
import type { JobMatchData, JobPosting } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase/profiles';
import { normalizeWorkTypes } from '@/lib/work-types';

export const BULLETIN_CACHE_TAG = 'bulletin-jobs';

/** Jobs older than this are never shown in the bulletin. */
const JOBS_MAX_AGE_MS = 28 * 24 * 60 * 60 * 1000;

const JOBS_SELECT_COLUMNS =
  'id, job_title, organization, location, municipality, province, work_type, date_posted, close_date, wage, listing_url, employment_type, summary, is_sse, source_id, sources(name), values, skills, unit_text, min_value, max_value, hours_per_week' as const;

const MATCH_SORT_OPTIONS = new Set<JobSortOption>([
  'match-desc',
  'value-match-desc',
  'skill-match-desc',
]);

const DATABASE_SORT_OPTIONS = new Set<JobSortOption>(['date-desc', 'date-asc', 'org-asc']);

const POSTED_WITHIN_DAYS: Record<Exclude<(typeof POSTED_WITHIN_FILTER_OPTIONS)[number], 'any'>, number> = {
  '1-week': 7,
  '2-weeks': 14,
  '3-weeks': 21,
  '1-month': 30,
};

type SearchParamValue = string | string[] | undefined;
export type BulletinSearchParams = Record<string, SearchParamValue>;

interface BulletinJobRowsResult {
  jobs: JobPosting[];
  lastScrapeTime: string | null;
}

interface BulletinMetaResult {
  lastScrapeTime: string | null;
  totalJobsCount: number;
}

export interface ParsedBulletinRequest {
  currentPage: number;
  filters: BulletinFilters;
  sortBy: JobSortOption;
}

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

type FilterOptionRow = {
  organization: string | null;
  province: string | null;
  municipality: string | null;
  employment_type: string | null;
  sources?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

function getRecentJobsCutoffIso(now = Date.now()): string {
  return new Date(now - JOBS_MAX_AGE_MS).toISOString();
}

function sanitizeSearchTerm(raw: string): string {
  return raw
    .trim()
    .replace(/[(),]/g, ' ')
    .replace(/[%_]/g, ' ')
    .replace(/\s+/g, ' ');
}

function getPostedWithinCutoffIso(
  postedWithin: (typeof POSTED_WITHIN_FILTER_OPTIONS)[number],
  now = Date.now(),
): string | null {
  if (postedWithin === 'any') {
    return null;
  }

  return new Date(now - POSTED_WITHIN_DAYS[postedWithin] * 24 * 60 * 60 * 1000).toISOString();
}

function applyFiltersToJobsQuery(query: any, filters: BulletinFilters): any {
  const now = filters.now ?? Date.now();

  let next = query.gte('date_posted', getRecentJobsCutoffIso(now));

  const searchTerm = sanitizeSearchTerm(filters.searchQuery);
  if (searchTerm.length > 0) {
    next = next.or(
      [
        `job_title.ilike.%${searchTerm}%`,
        `summary.ilike.%${searchTerm}%`,
        `organization.ilike.%${searchTerm}%`,
        `location.ilike.%${searchTerm}%`,
        `municipality.ilike.%${searchTerm}%`,
        `province.ilike.%${searchTerm}%`,
      ].join(','),
    );
  }

  if (filters.selectedOrganizations.length > 0) {
    next = next.in('organization', filters.selectedOrganizations);
  }

  if (filters.selectedProvinces.length > 0) {
    next = next.in('province', filters.selectedProvinces);
  }

  if (filters.selectedMunicipalities.length > 0) {
    next = next.in('municipality', filters.selectedMunicipalities);
  }

  if (filters.selectedEmploymentTypes.length > 0) {
    next = next.in('employment_type', filters.selectedEmploymentTypes);
  }

  if (filters.selectedWorkTypes.length > 0) {
    next = next.in('work_type', filters.selectedWorkTypes);
  }

  if (filters.showOnlySse) {
    next = next.eq('is_sse', true);
  }

  const postedWithinCutoffIso = getPostedWithinCutoffIso(filters.postedWithin, now);
  if (postedWithinCutoffIso) {
    next = next.gte('date_posted', postedWithinCutoffIso);
  }

  return next;
}

function applyDatabaseSort(query: any, sortBy: JobSortOption): any {
  switch (sortBy) {
    case 'date-asc':
      return query.order('date_posted', { ascending: true, nullsFirst: false });
    case 'org-asc':
      return query
        .order('organization', { ascending: true, nullsFirst: false })
        .order('date_posted', { ascending: false, nullsFirst: false });
    case 'date-desc':
    default:
      return query.order('date_posted', { ascending: false, nullsFirst: false });
  }
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
    let query = supabaseServer.from('jobs').select(JOBS_SELECT_COLUMNS, { count: 'exact' });
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
  let { data, error, count } = await runQuery(resolvedPage);

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

function getFirstValue(value: SearchParamValue): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function getStringArray(value: SearchParamValue, defaultValue: string[]): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => Boolean(item));
  }
  if (typeof value === 'string' && value.length > 0) {
    return [value];
  }
  return defaultValue;
}

function getBooleanValue(value: SearchParamValue, defaultValue: boolean): boolean {
  const raw = getFirstValue(value);
  if (!raw) return defaultValue;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return defaultValue;
}

function getPositiveIntValue(value: SearchParamValue, defaultValue: number): number {
  const raw = getFirstValue(value);
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function getLiteralValue<T extends readonly string[]>(
  value: SearchParamValue,
  validValues: T,
  defaultValue: T[number],
): T[number] {
  const raw = getFirstValue(value);
  return raw && validValues.includes(raw as T[number]) ? (raw as T[number]) : defaultValue;
}

function pickRecordKeys<T>(record: Record<string, T>, keys: Set<string>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => keys.has(key)),
  );
}

function parseBulletinRequest(
  searchParams: BulletinSearchParams,
  profile: Profile | null,
  userId: string | null,
): ParsedBulletinRequest {
  const defaultWorkTypes = userId ? normalizeWorkTypes(profile?.work_types) : [];
  const defaultProvinces = userId && profile?.province ? [profile.province] : [];
  const defaultMunicipalities = userId && profile?.municipality ? [profile.municipality] : [];

  return {
    currentPage: getPositiveIntValue(searchParams.page, 1),
    sortBy: getLiteralValue(searchParams.sort, JOB_SORT_OPTIONS, 'date-desc'),
    filters: {
      searchQuery: getFirstValue(searchParams.q) ?? '',
      selectedOrganizations: getStringArray(searchParams.org, []),
      selectedProvinces: getStringArray(searchParams.province, defaultProvinces),
      selectedMunicipalities: getStringArray(searchParams.municipality, defaultMunicipalities),
      selectedEmploymentTypes: getStringArray(searchParams.employment, []),
      selectedSources: getStringArray(searchParams.source, []),
      selectedWorkTypes: getStringArray(searchParams.workType, defaultWorkTypes),
      showOnlySse: getBooleanValue(searchParams.sse, true),
      showJobsWithoutSalary: getBooleanValue(searchParams.salary, true),
      postedWithin: getLiteralValue(searchParams.posted, POSTED_WITHIN_FILTER_OPTIONS, '2-weeks'),
    },
  };
}

function toSearchParamValueArray(values: string[]): SearchParamValue {
  if (values.length === 0) return undefined;
  if (values.length === 1) return values[0];
  return values;
}

export function toBulletinSearchParams(searchParams: URLSearchParams): BulletinSearchParams {
  return {
    q: toSearchParamValueArray(searchParams.getAll('q')),
    org: toSearchParamValueArray(searchParams.getAll('org')),
    province: toSearchParamValueArray(searchParams.getAll('province')),
    municipality: toSearchParamValueArray(searchParams.getAll('municipality')),
    employment: toSearchParamValueArray(searchParams.getAll('employment')),
    source: toSearchParamValueArray(searchParams.getAll('source')),
    workType: toSearchParamValueArray(searchParams.getAll('workType')),
    sse: toSearchParamValueArray(searchParams.getAll('sse')),
    salary: toSearchParamValueArray(searchParams.getAll('salary')),
    posted: toSearchParamValueArray(searchParams.getAll('posted')),
    sort: toSearchParamValueArray(searchParams.getAll('sort')),
    page: toSearchParamValueArray(searchParams.getAll('page')),
  };
}

export function parseBulletinRequestFromUrlSearchParams(
  searchParams: URLSearchParams,
): ParsedBulletinRequest {
  return parseBulletinRequest(toBulletinSearchParams(searchParams), null, null);
}

function shouldUseMatchSort(sortBy: JobSortOption) {
  return MATCH_SORT_OPTIONS.has(sortBy);
}

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

const fetchBulletinMeta = unstable_cache(
  async (): Promise<BulletinMetaResult> => {
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

const fetchBulletinJobRows = unstable_cache(
  async (): Promise<BulletinJobRowsResult> => {
    const [scrapeResult, jobsResult] = await Promise.all([
      supabaseServer
        .from('scrape_runs')
        .select('run_at')
        .order('run_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseServer
        .from('jobs')
        .select(
          'id, job_title, organization, location, municipality, province, work_type, date_posted, close_date, wage, listing_url, employment_type, summary, is_sse, source_id, sources(name), values, skills, unit_text, min_value, max_value, hours_per_week',
        )
        .gte('date_posted', new Date(Date.now() - JOBS_MAX_AGE_MS).toISOString())
        .order('date_posted', { ascending: false }),
    ]);

    if (scrapeResult.error) throw new Error(scrapeResult.error.message);
    if (jobsResult.error) throw new Error(jobsResult.error.message);

    return {
      jobs: normalizeJobsWithSource(jobsResult.data) as unknown as JobPosting[],
      lastScrapeTime: scrapeResult.data?.run_at ?? null,
    };
  },
  [BULLETIN_CACHE_TAG, 'rows'],
  { tags: [BULLETIN_CACHE_TAG], revalidate: 300 },
);

/**
 * Fetches and normalizes all bulletin jobs. Cached server-side for 5 minutes,
 * busted by /api/revalidate-jobs after a scrape. En/fr cached separately via args.
 */
export const fetchBulletinJobs = unstable_cache(
  async (locale: 'en' | 'fr') => {
    const bulletinRows = await fetchBulletinJobRows();
    const labelMap = await resolveSkillLabels(supabaseServer, bulletinRows.jobs, locale);

    return {
      jobs: bulletinRows.jobs,
      lastScrapeTime: bulletinRows.lastScrapeTime,
      skillLabels: Object.fromEntries(labelMap),
    };
  },
  [BULLETIN_CACHE_TAG, 'full'],
  { tags: [BULLETIN_CACHE_TAG], revalidate: 300 },
);

/**
 * Serializable match data shape for Server → Client Component prop transfer.
 * Maps are not JSON-serializable; we use Record instead.
 */
export type SerializedMatchData = Record<string, JobMatchData>;

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
    isPartialHydration: true,
    filteredJobsCount: queryResult.filteredJobsCount,
    totalJobsCount: queryResult.totalJobsCount,
    totalPages: queryResult.totalPages,
    filterOptions: queryResult.filterOptions,
  };
}

/**
 * Fetches ALL job_match rows for a user (no job_id filter) so this can run
 * in parallel with the jobs fetch. The caller filters to relevant job IDs.
 */
export async function fetchServerMatchData(userId: string): Promise<SerializedMatchData> {
  try {
    const { data, error } = await supabaseServer
      .from('job_matches')
      .select(
        'job_id, score, value_score, skill_score, work_type_score, location_score, shared_values, shared_skills',
      )
      .eq('user_id', userId);

    if (error || !data) return {};

    const result: SerializedMatchData = {};
    for (const row of data as Array<{
      job_id: string;
      score: number;
      value_score: number | null;
      skill_score: number | null;
      work_type_score: number | null;
      location_score: number | null;
      shared_values: string[];
      shared_skills: string[] | null;
    }>) {
      result[row.job_id] = {
        score: row.score,
        value_score: row.value_score,
        skill_score: row.skill_score,
        work_type_score: row.work_type_score,
        location_score: row.location_score,
        shared_values: row.shared_values ?? [],
        shared_skills: row.shared_skills ?? [],
      };
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Fetches ALL bookmarks for a user so this can run in parallel with the jobs fetch.
 * Returns bookmark job IDs as a plain string array (serializable).
 */
export async function fetchServerBookmarks(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabaseServer
      .from('bookmarks')
      .select('job_id')
      .eq('user_id', userId);

    if (error || !data) return [];
    return (data as Array<{ job_id: string }>).map((b) => b.job_id);
  } catch {
    return [];
  }
}

/**
 * Fetches a user's profile via the service-role client (bypasses RLS).
 * Used server-side in the page Server Component.
 */
export async function fetchServerProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabaseServer
      .from('profiles')
      .select(
        'id, full_name, bio, values, values_rated, skills, skills_rated, work_types, lat, lng, municipality, province, location_display_name, profile_photo_url, created_at, updated_at',
      )
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return null;
    return data as Profile;
  } catch {
    return null;
  }
}
