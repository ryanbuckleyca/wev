import 'server-only';

import { supabaseServer } from '@/lib/supabase-server';
import { createClient } from '@/lib/supabase/server';
import { bulletinAgeCutoffIso, PRODUCT_DEFAULT_POSTED_WITHIN } from './constants';
import { resolveSkillLabels, type SkillLabel } from '@/lib/resolve-skill-labels';
import type { JobMatchData, JobPosting } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase/profiles';

import { buildFilterOptions, type BulletinFilterOptions } from './filter-options';
import { throwBulletinQueryError } from './fts-errors';
import { resolveOrgSlugs } from './resolve-org-slugs';
import { formatSearchQuery } from './search-utils';

export const BULLETIN_CACHE_TAG = 'bulletin-jobs';
export const BULLETIN_JOB_SELECT =
  'id, job_title, organization, organization_id, location, municipality, province, work_type, date_posted, close_date, wage, listing_url, employment_type, summary, is_sse, has_compensation, source, values, skills, unit_text, min_value, max_value, hours_per_week, language';

/**
 * Jobs "X of Y" denominator (`totalAvailable`):
 * matched_jobs in the **current** `postedWithin` window + SSE scope + compensation scope.
 * Search / geo / source / work / language chips affect `total`, not this denominator.
 *
 * Org index "X of Y" (see `lib/organizations/server-data.ts`) is intentionally different:
 * orgs with ≥1 active job under the **hard 28-day** bulletin ceiling + SSE scope;
 * it does **not** apply the jobs-board 2-week `postedWithin` product default.
 */
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
  userCacheKey?: string;
};

type BulletinSupabase = Awaited<ReturnType<typeof createClient>>;

type BulletinQueryResult = {
  jobs: JobPosting[];
  total: number;
  totalAvailable: number;
  lastScrapeTime: string | null;
  skillLabels: Record<string, SkillLabel>;
  filterOptions: BulletinFilterOptions;
};

export function postedWithinToDays(postedWithin: string): number | null {
  if (postedWithin === '1-week') return 7;
  if (postedWithin === '2-weeks') return 14;
  if (postedWithin === '3-weeks') return 21;
  if (postedWithin === '1-month') return 30;
  return null;
}

const getBulletinMaxAgeCutoff = bulletinAgeCutoffIso;

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

/** Hard 4-week ceiling + optional tighter postedWithin window. */
export function applyBulletinAgeFilter(query: any, postedWithin: string) {
  const maxAgeCutoff = getBulletinMaxAgeCutoff();
  query = query.gte('date_posted', maxAgeCutoff);

  const postedWithinDays = postedWithinToDays(postedWithin);
  if (postedWithinDays != null) {
    const cutoff = new Date(Date.now() - postedWithinDays * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('date_posted', cutoff);
  }
  return query;
}

/**
 * Product baseline for "available" job counts: SSE scope + compensation scope.
 * (Age cutoff is applied separately.) Matches org-index denominator spirit.
 */
export function applyBulletinAvailabilityFilters(
  query: any,
  opts: { onlySse: boolean; noSalary: boolean },
) {
  if (opts.onlySse) query = query.is('is_sse', true);
  if (!opts.noSalary) query = query.eq('has_compensation', true);
  return query;
}

/** Columns used to build facet option lists (search + age window only). */
export const BULLETIN_FACET_SELECT =
  'organization, province, municipality, employment_type, source, language';

/**
 * Facet rows for the current search/age window.
 * Intentionally omits SSE/salary/work/language filters so multi-select options stay visible.
 */
export async function fetchBulletinFacetRows(
  supabase: any,
  vectorColumn: string,
  opts: { searchQuery: string; postedWithin: string },
): Promise<any[]> {
  let query = supabase.from('matched_jobs').select(BULLETIN_FACET_SELECT);
  query = applySearchFilter(query, vectorColumn, opts.searchQuery);
  query = applyBulletinAgeFilter(query, opts.postedWithin);

  const { data, error } = await query.limit(5000);
  if (error) {
    throwBulletinQueryError(error, {
      searchQuery: opts.searchQuery,
      searchColumn: vectorColumn,
    });
  }

  return data ?? [];
}

function applyNonFacetFilters(query: any, input: BulletinQueryInput) {
  if (input.works.length) query = query.in('work_type', input.works);
  if (input.langs.length) query = query.in('language', input.langs);
  return applyBulletinAvailabilityFilters(query, {
    onlySse: input.onlySse,
    noSalary: input.noSalary,
  });
}

function applyBulletinFilters(query: any, input: BulletinQueryInput) {
  if (input.orgs.length) query = query.in('organization', input.orgs);
  if (input.provs.length) query = query.in('province', input.provs);
  if (input.munis.length) query = query.in('municipality', input.munis);
  if (input.emps.length) query = query.in('employment_type', input.emps);
  if (input.srcs.length) query = query.in('source', input.srcs);
  return applyNonFacetFilters(query, input);
}

async function fetchBulletinFacets(
  supabase: any,
  vectorColumn: string,
  input: BulletinQueryInput,
): Promise<BulletinFilterOptions> {
  const rows = await fetchBulletinFacetRows(supabase, vectorColumn, {
    searchQuery: input.searchQuery,
    postedWithin: input.postedWithin,
  });
  return buildFilterOptions((rows ?? []) as any[]);
}

/**
 * Shared bulletin list query used by `/api/bulletin` and unit tests.
 * Pass `supabaseClient` from the request to keep RLS/cookie auth consistent.
 */
export async function fetchBulletinQueryPayload(
  input: BulletinQueryInput,
  supabaseClient?: BulletinSupabase,
): Promise<BulletinQueryResult> {
  const supabase = supabaseClient ?? (await createClient());
  const start = (input.page - 1) * input.limit;
  const end = start + input.limit - 1;
  const searchColumn = input.locale === 'fr' ? 'fts_fr' : 'fts_en';

  const buildJobsQuery = (vectorColumn: string) => {
    let query = supabase.from('matched_jobs').select(BULLETIN_JOB_SELECT, { count: 'exact' });
    query = applySearchFilter(query, vectorColumn, input.searchQuery);
    query = applyBulletinFilters(query, input);
    query = applyBulletinAgeFilter(query, input.postedWithin);

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
      case 'org-desc':
        query = query.order('organization', { ascending: false });
        break;
      case 'date-desc':
      default:
        query = query.order('date_posted', { ascending: false });
        break;
    }

    return query;
  };

  // Universe for empty-state / "X of Y": current posted window + SSE/compensation scope.
  let totalAvailableQuery = supabase.from('matched_jobs').select('id', { count: 'exact', head: true });
  totalAvailableQuery = applyBulletinAgeFilter(totalAvailableQuery, input.postedWithin);
  totalAvailableQuery = applyBulletinAvailabilityFilters(totalAvailableQuery, {
    onlySse: input.onlySse,
    noSalary: input.noSalary,
  });

  const [jobsResult, finalFilterOptions, scrapeTime, totalAvailableResult] = await Promise.all([
    buildJobsQuery(searchColumn).range(start, end),
    fetchBulletinFacets(supabase, searchColumn, input),
    fetchLastScrapeTime(),
    totalAvailableQuery,
  ]);

  if (jobsResult.error) {
    throwBulletinQueryError(jobsResult.error, {
      searchQuery: input.searchQuery,
      searchColumn,
    });
  }
  if (totalAvailableResult.error) {
    console.error('Error fetching total available jobs:', totalAvailableResult.error.message);
  }

  const jobs = Array.isArray(jobsResult.data) ? jobsResult.data : [];
  await resolveOrgSlugs(supabase, jobs);
  const labelMap = await resolveSkillLabels(supabase, jobs, input.locale);

  return {
    jobs: jobs as JobPosting[],
    total: jobsResult.count ?? 0,
    totalAvailable: totalAvailableResult.count ?? 0,
    lastScrapeTime: scrapeTime,
    skillLabels: Object.fromEntries(labelMap),
    filterOptions: finalFilterOptions,
  };
}

/** @deprecated Prefer {@link fetchBulletinQueryPayload}. */
export async function fetchCachedBulletinQueryPayload(
  input: BulletinQueryInput,
): Promise<BulletinQueryResult> {
  return fetchBulletinQueryPayload(input);
}

/**
 * Fetches and returns the last scrape time.
 * Returns null gracefully if the table is inaccessible (e.g. missing RLS grant in local dev).
 */
export async function fetchLastScrapeTime(): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from('scrape_runs')
    .select('run_at')
    .order('run_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Non-fatal — missing scrape time shouldn't break the page
    console.warn('[fetchLastScrapeTime]', error.message);
    return null;
  }
  return data?.run_at ?? null;
}

const fetchServerBulletinJobsImpl = async (locale: 'en' | 'fr') => {
  // SSR landing defaults: product posted window + SSE-only + listed compensation.
  let totalAvailableQuery = supabaseServer
    .from('matched_jobs')
    .select('id', { count: 'exact', head: true });
  totalAvailableQuery = applyBulletinAgeFilter(totalAvailableQuery, PRODUCT_DEFAULT_POSTED_WITHIN);
  totalAvailableQuery = applyBulletinAvailabilityFilters(totalAvailableQuery, {
    onlySse: true,
    noSalary: false,
  });

  let jobsQuery = supabaseServer
    .from('matched_jobs')
    .select(BULLETIN_JOB_SELECT, { count: 'exact' });
  jobsQuery = applyBulletinAgeFilter(jobsQuery, PRODUCT_DEFAULT_POSTED_WITHIN);
  jobsQuery = applyBulletinAvailabilityFilters(jobsQuery, {
    onlySse: true,
    noSalary: false,
  });

  // Facets: search/age window only — not SSE/salary — so options stay combinable.
  const facetsPromise = fetchBulletinFacetRows(supabaseServer, 'fts_en', {
    searchQuery: '',
    postedWithin: PRODUCT_DEFAULT_POSTED_WITHIN,
  });

  const [scrapeTime, jobsResult, totalAvailableResult, facetRows] = await Promise.all([
    fetchLastScrapeTime(),
    jobsQuery.order('date_posted', { ascending: false }).range(0, 19),
    totalAvailableQuery,
    facetsPromise,
  ]);

  if (jobsResult.error) throw new Error(jobsResult.error.message);

  const jobs = Array.isArray(jobsResult.data) ? jobsResult.data : [];
  await resolveOrgSlugs(supabaseServer, jobs);
  const labelMap = await resolveSkillLabels(supabaseServer, jobs, locale);

  return {
    jobs: jobs as JobPosting[],
    total: jobsResult.count ?? 0,
    totalAvailable: totalAvailableResult.count ?? 0,
    lastScrapeTime: scrapeTime,
    skillLabels: Object.fromEntries(labelMap),
    filterOptions: buildFilterOptions((facetRows ?? []) as any[]),
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
