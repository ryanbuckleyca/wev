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
import { buildFilterOptions, type BulletinFilterOptions } from '@/lib/bulletin/filter-options';
import { supabaseServer } from '@/lib/supabase-server';
import normalizeJobsWithSource from '@/lib/normalize-job';
import { resolveSkillLabels } from '@/lib/resolve-skill-labels';
import type { JobMatchData, JobPosting } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase/profiles';
import { normalizeWorkTypes } from '@/lib/work-types';

export const BULLETIN_CACHE_TAG = 'bulletin-jobs';

/** Jobs older than this are never shown in the bulletin. */
const JOBS_MAX_AGE_MS = 28 * 24 * 60 * 60 * 1000;

type SearchParamValue = string | string[] | undefined;
export type BulletinSearchParams = Record<string, SearchParamValue>;

interface BulletinJobRowsResult {
  jobs: JobPosting[];
  lastScrapeTime: string | null;
}

export interface ParsedBulletinRequest {
  currentPage: number;
  filters: BulletinFilters;
  sortBy: JobSortOption;
}

const MATCH_SORT_OPTIONS = new Set<JobSortOption>([
  'match-desc',
  'value-match-desc',
  'skill-match-desc',
]);

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
  const bulletinRows = await fetchBulletinJobRows();

  let matchMap = new Map<string, JobMatchData>();
  if (userId && shouldUseMatchSort(request.sortBy)) {
    const serializedMatchData = await fetchServerMatchData(userId);
    matchMap = new Map(Object.entries(serializedMatchData));
  }

  const filteredJobs = sortJobs(
    filterJobs(bulletinRows.jobs, request.filters),
    request.sortBy,
    matchMap,
  );

  const totalPages = Math.ceil(filteredJobs.length / BULLETIN_ITEMS_PER_PAGE);
  const resolvedPage =
    totalPages === 0 ? 1 : Math.min(Math.max(request.currentPage, 1), totalPages);

  const pageJobs = includeAllFilteredJobs
    ? filteredJobs
    : filteredJobs.slice(
        (resolvedPage - 1) * BULLETIN_ITEMS_PER_PAGE,
        resolvedPage * BULLETIN_ITEMS_PER_PAGE,
      );

  const labelMap = await resolveSkillLabels(supabaseServer, pageJobs, locale);

  return {
    jobs: pageJobs,
    lastScrapeTime: bulletinRows.lastScrapeTime,
    skillLabels: Object.fromEntries(labelMap),
    filteredJobsCount: filteredJobs.length,
    totalJobsCount: bulletinRows.jobs.length,
    totalPages,
    currentPage: resolvedPage,
    filterOptions: includeFilterOptions ? buildFilterOptions(bulletinRows.jobs) : undefined,
  };
}

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
