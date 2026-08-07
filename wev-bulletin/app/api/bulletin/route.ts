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

    // SSE-only: non-SSE records are never surfaced in the front-end.
    const onlySse = true;

    const includeUnlistedPay = searchParams.get('nosal') === 'true';

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
      includeUnlistedPay,
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
