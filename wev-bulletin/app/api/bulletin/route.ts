import { NextResponse } from 'next/server';
import {
  BULLETIN_CACHE_TAG,
  fetchBulletinQueryPayload,
  type BulletinQueryInput,
} from '@/lib/bulletin/server-data';
import { PRODUCT_DEFAULT_POSTED_WITHIN } from '@/lib/bulletin/constants';
import { parseLocale } from '@/lib/resolve-skill-labels';
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
    const limit = parseBoundedInteger(
      searchParams.get('limit'),
      ITEMS_PER_PAGE,
      1,
      MAX_ITEMS_PER_PAGE,
    );
    const searchQuery = (searchParams.get('q') ?? '').trim().slice(0, MAX_SEARCH_QUERY_LENGTH);
    const sortBy = searchParams.get('sortBy') || 'date-desc';
    const postedWithin = searchParams.get('postedWithin') || PRODUCT_DEFAULT_POSTED_WITHIN;

    // Parse array filters natively
    const orgs = searchParams.getAll('orgs');
    const provs = searchParams.getAll('provs');
    const munis = searchParams.getAll('munis');
    const emps = searchParams.getAll('emps');
    const srcs = searchParams.getAll('srcs');
    const works = searchParams.getAll('works');
    const langs = searchParams.getAll('langs');

    // SSE filter with backward compatibility:
    // - New API: nonSse=true means "include non-SSE jobs"; absence means SSE-only
    // - Old API: sse=true means "SSE-only"; absence means include all
    // - Priority: nonSse takes precedence if both are present
    let onlySse: boolean;
    const nonSseParam = searchParams.get('nonSse');
    const sseParam = searchParams.get('sse');

    if (nonSseParam !== null) {
      // New API: nonSse present, use it (nonSse=true → onlySse=false)
      onlySse = nonSseParam !== 'true';
    } else if (sseParam !== null) {
      // Old API: sse present, use it (sse=true → onlySse=true)
      onlySse = sseParam === 'true';
    } else {
      // Neither present: default to SSE-only to match frontend default (showNonSse=false)
      // This is intentional product behavior. The frontend defaults to showing only SSE jobs,
      // and the API default aligns with that to prevent confusion when the page first loads.
      // Legacy API clients that relied on the absence of 'sse' meaning "show all" will need
      // to explicitly pass nonSse=true to see non-SSE jobs.
      onlySse = true;
    }

    const noSalary = searchParams.get('nosal') === 'true';

    const supabase = await createClient();

    const input: BulletinQueryInput = {
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
      langs,
      onlySse,
      noSalary,
      userCacheKey: 'api',
    };

    const payload = await fetchBulletinQueryPayload(input, supabase);

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
