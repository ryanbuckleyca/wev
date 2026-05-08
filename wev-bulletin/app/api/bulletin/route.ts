import { NextResponse } from 'next/server';
import {
  BULLETIN_CACHE_TAG,
  BULLETIN_JOB_SELECT,
  fetchLastScrapeTime,
} from '@/lib/bulletin/server-data';
import { parseLocale, resolveSkillLabels } from '@/lib/resolve-skill-labels';
import { BULLETIN_MAX_AGE_DAYS } from '@/lib/bulletin/constants';
import { createClient } from '@/lib/supabase/server';

export { BULLETIN_CACHE_TAG };
export const dynamic = 'force-dynamic';

const ITEMS_PER_PAGE = 20;
const MAX_ITEMS_PER_PAGE = 100;
const MAX_PAGE = 1_000;
const MAX_SEARCH_QUERY_LENGTH = 200;

type BulletinApiQueryInput = {
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
  onlySse: boolean;
  noSalary: boolean;
};

function isUndefinedColumnError(error: { code?: string } | null): boolean {
  return error?.code === '42703';
}

function parseBoundedInteger(
  rawValue: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (rawValue == null) return fallback;

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed)) return fallback;

  return Math.min(max, Math.max(min, parsed));
}

function createBuildQueryFn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: BulletinApiQueryInput,
) {
  const start = (input.page - 1) * input.limit;
  const end = start + input.limit - 1;

  return (vectorColumn: string) => {
    let query = supabase.from('matched_jobs').select(BULLETIN_JOB_SELECT, { count: 'exact' });

    // 1. Text Search (FTS)
    if (input.searchQuery.length > 0) {
      query = query.textSearch(vectorColumn, input.searchQuery, { type: 'websearch' });
    }

    // 2. Exact Matchers
    if (input.orgs.length) query = query.in('organization', input.orgs);
    if (input.provs.length) query = query.in('province', input.provs);
    if (input.munis.length) query = query.in('municipality', input.munis);
    if (input.emps.length) query = query.in('employment_type', input.emps);
    if (input.srcs.length) query = query.in('source', input.srcs);
    if (input.works.length) query = query.in('work_type', input.works);
    if (input.onlySse) query = query.is('is_sse', true);

    if (!input.noSalary) {
      query = query.eq('has_compensation', true);
    }

    // 3. Date Filters
    const maxAgeCutoff = new Date(
      Date.now() - BULLETIN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    query = query.gte('date_posted', maxAgeCutoff);

    if (input.postedWithin !== 'any') {
      const days =
        input.postedWithin === '1-week'
          ? 7
          : input.postedWithin === '2-weeks'
            ? 14
            : input.postedWithin === '3-weeks'
              ? 21
              : 30; // Will be clamped by maxAgeCutoff above anyway
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('date_posted', cutoff);
    }

    // 4. Sorting & Pagination
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

    return query.range(start, end);
  };
}

async function fetchBulletinApiPayload(
  input: BulletinApiQueryInput,
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const searchColumn = input.locale === 'fr' ? 'fts_fr' : 'fts_en';
  const buildQuery = createBuildQueryFn(supabase, input);

  // Get total available jobs (<= 4 weeks old, no other filters)
  const maxAgeCutoff = new Date(
    Date.now() - BULLETIN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const totalAvailableQuery = supabase
    .from('matched_jobs')
    .select('id', { count: 'exact' })
    .gte('date_posted', maxAgeCutoff)
    .limit(0);

  const [initialJobsResult, scrapeTime, totalAvailableResult] = await Promise.all([
    buildQuery(searchColumn),
    fetchLastScrapeTime(),
    totalAvailableQuery,
  ]);
  let jobsResult = initialJobsResult;

  if (
    jobsResult.error &&
    input.searchQuery.length > 0 &&
    isUndefinedColumnError(jobsResult.error)
  ) {
    jobsResult = await buildQuery('fts');
  }

  if (jobsResult.error) throw new Error(jobsResult.error.message);
  if (totalAvailableResult.error) {
    console.error('Error fetching total available jobs:', totalAvailableResult.error.message);
  }

  const jobs = jobsResult.data;
  const labelMap = await resolveSkillLabels(supabase, jobs, input.locale);

  return {
    jobs,
    total: jobsResult.count ?? 0,
    totalAvailable: totalAvailableResult.count ?? 0,
    lastScrapeTime: scrapeTime,
    skillLabels: Object.fromEntries(labelMap),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const locale = parseLocale(searchParams.get('locale'));
    const page = parseBoundedInteger(searchParams.get('page'), 1, 1, MAX_PAGE);
    const limit = parseBoundedInteger(
      searchParams.get('limit'),
      ITEMS_PER_PAGE,
      1,
      MAX_ITEMS_PER_PAGE,
    );
    const searchQuery = (searchParams.get('q') ?? '').trim().slice(0, MAX_SEARCH_QUERY_LENGTH);
    const sortBy = searchParams.get('sortBy') || 'date-desc';
    const postedWithin = searchParams.get('postedWithin') || 'any';

    // Parse array filters natively
    const orgs = searchParams.getAll('orgs');
    const provs = searchParams.getAll('provs');
    const munis = searchParams.getAll('munis');
    const emps = searchParams.getAll('emps');
    const srcs = searchParams.getAll('srcs');
    const works = searchParams.getAll('works');
    const onlySse = searchParams.get('sse') === 'true';
    const noSalary = searchParams.get('nosal') === 'true';

    // Create supabase client
    const supabase = await createClient();

    const input: BulletinApiQueryInput = {
      locale,
      page,
      limit,
      searchQuery,
      sortBy,
      postedWithin,
      orgs,
      provs,
      munis,
      emps,
      srcs,
      works,
      onlySse,
      noSalary,
    };

    const payload = await fetchBulletinApiPayload(input, supabase);

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch bulletin';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
