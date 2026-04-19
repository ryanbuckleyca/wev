import { NextResponse } from 'next/server';
import { fetchLastScrapeTime, BULLETIN_CACHE_TAG } from '@/lib/bulletin/server-data';
import { parseLocale, resolveSkillLabels } from '@/lib/resolve-skill-labels';
import { createClient } from '@/lib/supabase/server';

export { BULLETIN_CACHE_TAG };
export const dynamic = 'force-dynamic';

const ITEMS_PER_PAGE = 20;
const MAX_ITEMS_PER_PAGE = 100;
const MAX_PAGE = 1_000;
const MAX_SEARCH_QUERY_LENGTH = 200;

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const locale = parseLocale(searchParams.get('locale'));
    const page = parseBoundedInteger(searchParams.get('page'), 1, 1, MAX_PAGE);
    const limit = parseBoundedInteger(searchParams.get('limit'), ITEMS_PER_PAGE, 1, MAX_ITEMS_PER_PAGE);
    const searchQuery = (searchParams.get('q') ?? '').trim().slice(0, MAX_SEARCH_QUERY_LENGTH);
    const searchColumn = locale === 'fr' ? 'fts_fr' : 'fts_en';
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

    const supabase = await createClient();
    let query = supabase.from('matched_jobs').select('*', { count: 'exact' });

    // 1. Text Search (FTS)
    if (searchQuery.length > 0) {
      query = query.textSearch(searchColumn, searchQuery, { type: 'websearch' });
    }

    // 2. Exact Matchers
    if (orgs.length) query = query.in('organization', orgs);
    if (provs.length) query = query.in('province', provs);
    if (munis.length) query = query.in('municipality', munis);
    if (emps.length) query = query.in('employment_type', emps);
    if (srcs.length) query = query.in('source', srcs);
    if (works.length) query = query.in('work_type', works);
    if (onlySse) query = query.is('is_sse', true);

    if (!noSalary) {
      // E.g. Filter out jobs that don't have wage OR min_value
      query = query.or('wage.neq."",min_value.not.is.null');
    }

    // 3. Date Filters
    if (postedWithin !== 'any') {
      const days =
        postedWithin === '1-week'
          ? 7
          : postedWithin === '2-weeks'
            ? 14
            : postedWithin === '3-weeks'
              ? 21
              : 30;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('date_posted', cutoff);
    }

    // 4. Sorting & Pagination
    switch (sortBy) {
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

    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    // Run remote requests
    const [jobsResult, scrapeTime] = await Promise.all([query, fetchLastScrapeTime()]);

    if (jobsResult.error) throw new Error(jobsResult.error.message);

    const jobs = jobsResult.data;
    const labelMap = await resolveSkillLabels(supabase, jobs, locale);

    return NextResponse.json(
      {
        jobs,
        total: jobsResult.count ?? 0,
        lastScrapeTime: scrapeTime,
        skillLabels: Object.fromEntries(labelMap),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch bulletin';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
