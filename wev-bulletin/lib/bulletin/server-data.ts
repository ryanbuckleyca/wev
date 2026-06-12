import 'server-only';

import { supabaseServer } from '@/lib/supabase-server';
import { createClient } from '@/lib/supabase/server';
import { BULLETIN_MAX_AGE_DAYS } from './constants';
import { resolveSkillLabels, type SkillLabel } from '@/lib/resolve-skill-labels';
import type { JobMatchData, JobPosting } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase/profiles';

import { buildFilterOptions, type BulletinFilterOptions } from './filter-options';
import { formatSearchQuery } from './search-utils';

export const BULLETIN_CACHE_TAG = 'bulletin-jobs';
export const BULLETIN_JOB_SELECT =
  'id, job_title, organization, location, municipality, province, work_type, date_posted, close_date, wage, listing_url, employment_type, summary, is_sse, source, values, skills, unit_text, min_value, max_value, hours_per_week, language';

export type BulletinQueryInput = {
  locale: 'en' | 'fr';
  page: number;
  limit: number;
  searchQuery: string;
  sortBy: string;
  postedWithin: string;
  orgs: string[];
  provs: string[];
  munis: string[];
  emps: string[];
  srcs: string[];
  works: string[];
  langs: string[];
  onlySse: boolean;
  noSalary: boolean;
  // Included for cache key partitioning to prevent cross-user match-sort leakage.
  userCacheKey: string;
};

type BulletinQueryResult = {
  jobs: JobPosting[];
  total: number;
  totalAvailable: number;
  lastScrapeTime: string | null;
  skillLabels: Record<string, SkillLabel>;
  filterOptions: BulletinFilterOptions;
};

function isUndefinedColumnError(error: { code?: string } | null): boolean {
  return error?.code === '42703';
}

function postedWithinToDays(postedWithin: string): number | null {
  if (postedWithin === '1-week') return 7;
  if (postedWithin === '2-weeks') return 14;
  if (postedWithin === '3-weeks') return 21;
  if (postedWithin === '1-month') return 30;
  return null;
}

function getBulletinMaxAgeCutoff(): string {
  return new Date(Date.now() - BULLETIN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function applySearchFilter(query: any, vectorColumn: string, searchQuery: string) {
  if (searchQuery.length > 0) {
    const { formatted, type } = formatSearchQuery(searchQuery);
    if (type === 'fts') {
      return query.filter(vectorColumn, 'fts', formatted);
    }
    return query.textSearch(vectorColumn, formatted, { type: type as any });
  }
  return query;
}

function applyAgeFilter(query: any, postedWithin: string) {
  const maxAgeCutoff = getBulletinMaxAgeCutoff();
  query = query.gte('date_posted', maxAgeCutoff);

  const postedWithinDays = postedWithinToDays(postedWithin);
  if (postedWithinDays != null) {
    const cutoff = new Date(Date.now() - postedWithinDays * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('date_posted', cutoff);
  }
  return query;
}

function applyNonFacetFilters(query: any, input: BulletinQueryInput) {
  if (input.works.length) query = query.in('work_type', input.works);
  if (input.langs.length) query = query.in('language', input.langs);
  if (input.onlySse) query = query.is('is_sse', true);
  if (!input.noSalary) query = query.eq('has_compensation', true);
  return query;
}

function applyBulletinFilters(query: any, input: BulletinQueryInput) {
  if (input.orgs.length) query = query.in('organization', input.orgs);
  if (input.provs.length) query = query.in('province', input.provs);
  if (input.munis.length) query = query.in('municipality', input.munis);
  if (input.emps.length) query = query.in('employment_type', input.emps);
  if (input.srcs.length) query = query.in('source', input.srcs);
  if (input.langs.length) query = query.in('language', input.langs);
  return applyNonFacetFilters(query, input);
}

async function fetchBulletinFacets(
  supabase: any,
  vectorColumn: string,
  input: BulletinQueryInput,
): Promise<BulletinFilterOptions> {
  let query = supabase
    .from('matched_jobs')
    .select('organization, province, municipality, employment_type, source');

  query = applySearchFilter(query, vectorColumn, input.searchQuery);
  query = applyAgeFilter(query, input.postedWithin);

  // Facets intentionally do NOT apply non-facet filters (work type, language,
  // SSE, salary). Facets represent the full universe of options available for
  // the current search/age window so the user can see and combine them freely.
  // Applying those filters here would hide options as soon as one is selected,
  // making multi-select feel broken (e.g. selecting "remote" would remove
  // "hybrid" from the list).
  // Limit the impact of unbounded facet queries while keeping them relatively accurate
  const { data, error } = await query.limit(5000);
  if (error) throw new Error(error.message);

  return buildFilterOptions((data ?? []) as any[]);
}

async function runBulletinQuery(input: BulletinQueryInput): Promise<BulletinQueryResult> {
  const supabase = await createClient();
  const start = (input.page - 1) * input.limit;
  const end = start + input.limit - 1;
  const searchColumn = input.locale === 'fr' ? 'fts_fr' : 'fts_en';

  const buildJobsQuery = (vectorColumn: string) => {
    let query = supabase.from('matched_jobs').select(BULLETIN_JOB_SELECT, { count: 'exact' });
    query = applySearchFilter(query, vectorColumn, input.searchQuery);
    query = applyBulletinFilters(query, input);
    query = applyAgeFilter(query, input.postedWithin);

    switch (input.sortBy) {
      case 'date-asc':
        query = query.order('date_posted', { ascending: true });
        break;
      case 'match-desc':
        query = query.order('match_score', { ascending: false });
        break;
      case 'value-match-desc':
        query = query.order('value_score', { ascending: false });
        break;
      case 'skill-match-desc':
        query = query.order('skill_score', { ascending: false });
        break;
      case 'salary-desc':
        query = query.order('min_value', { ascending: false, nullsFirst: false });
        break;
      case 'salary-asc':
        query = query.order('min_value', { ascending: true, nullsFirst: false });
        break;
      case 'org-asc':
        query = query.order('organization', { ascending: true });
        break;
      case 'date-desc':
      default:
        query = query.order('date_posted', { ascending: false });
        break;
    }

    return query;
  };

  const totalAvailableQuery = supabase
    .from('matched_jobs')
    .select('id', { count: 'exact', head: true })
    .gte('date_posted', getBulletinMaxAgeCutoff());

  const [initialJobsResult, filterOptions, scrapeTime, totalAvailableResult] = await Promise.all([
    buildJobsQuery(searchColumn).range(start, end),
    fetchBulletinFacets(supabase, searchColumn, input),
    fetchLastScrapeTime(),
    totalAvailableQuery,
  ]);

  let jobsResult = initialJobsResult;
  let finalFilterOptions = filterOptions;

  if (
    jobsResult.error &&
    input.searchQuery.length > 0 &&
    isUndefinedColumnError(jobsResult.error)
  ) {
    const [retryJobs, retryFacets] = await Promise.all([
      buildJobsQuery('fts').range(start, end),
      fetchBulletinFacets(supabase, 'fts', input),
    ]);
    jobsResult = retryJobs;
    finalFilterOptions = retryFacets;
  }

  if (jobsResult.error) throw new Error(jobsResult.error.message);

  const jobs = (jobsResult.data ?? []) as unknown as JobPosting[];
  const labelMap = await resolveSkillLabels(supabase, jobs, input.locale);

  return {
    jobs,
    total: jobsResult.count ?? 0,
    totalAvailable: totalAvailableResult.count ?? 0,
    lastScrapeTime: scrapeTime,
    skillLabels: Object.fromEntries(labelMap),
    filterOptions: finalFilterOptions,
  };
}

export async function fetchCachedBulletinQueryPayload(
  input: BulletinQueryInput,
): Promise<BulletinQueryResult> {
  return runBulletinQuery(input);
}

/**
 * Fetches and returns the last scrape time.
 */
export async function fetchLastScrapeTime(): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from('scrape_runs')
    .select('run_at')
    .order('run_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.run_at ?? null;
}

const fetchServerBulletinJobsImpl = async (locale: 'en' | 'fr') => {
  const postedCutoff = getBulletinMaxAgeCutoff();

  const totalAvailableQuery = supabaseServer
    .from('matched_jobs')
    .select('id', { count: 'exact', head: true })
    .gte('date_posted', postedCutoff);

  const [scrapeTime, jobsResult, totalAvailableResult, filterOptionsResult] = await Promise.all([
    fetchLastScrapeTime(),
    supabaseServer
      .from('matched_jobs')
      .select(BULLETIN_JOB_SELECT, { count: 'exact' })
      .gte('date_posted', postedCutoff)
      .is('is_sse', true)
      .order('date_posted', { ascending: false })
      .range(0, 19),
    totalAvailableQuery,
    supabaseServer
      .from('matched_jobs')
      .select('organization, province, municipality, employment_type, source')
      .gte('date_posted', postedCutoff)
      .is('is_sse', true)
      .limit(5000),
  ]);

  if (jobsResult.error) throw new Error(jobsResult.error.message);
  if (filterOptionsResult.error) throw new Error(filterOptionsResult.error.message);

  const jobs = (jobsResult.data ?? []) as unknown as JobPosting[];
  const labelMap = await resolveSkillLabels(supabaseServer, jobs, locale);

  return {
    jobs,
    total: jobsResult.count ?? 0,
    totalAvailable: totalAvailableResult.count ?? 0,
    lastScrapeTime: scrapeTime,
    skillLabels: Object.fromEntries(labelMap),
    filterOptions: buildFilterOptions((filterOptionsResult.data ?? []) as any[]),
  };
};

/**
 * Fetches the initial page of bulletin jobs for SSR.
 */
export async function fetchServerBulletinJobs(locale: 'en' | 'fr') {
  return fetchServerBulletinJobsImpl(locale);
}

/**
 * Serializable match data shape for Server → Client Component prop transfer.
 * Maps are not JSON-serializable; we use Record instead.
 */
export type SerializedMatchData = Record<string, JobMatchData>;

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
