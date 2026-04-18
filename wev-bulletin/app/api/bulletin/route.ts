import { NextResponse } from 'next/server';
import {
  queryBulletinJobs,
  parseBulletinRequestFromUrlSearchParams,
  BULLETIN_CACHE_TAG,
  MATCH_SORT_OPTIONS,
} from '@/lib/bulletin/server-data';
import { getRequestUser } from '@/lib/auth/request-user';
import { parseLocale } from '@/lib/resolve-skill-labels';

// Re-export so /api/revalidate-jobs can reference the same tag.
export { BULLETIN_CACHE_TAG };

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
};

const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60',
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const locale = parseLocale(searchParams.get('locale'));
    const parsedRequest = parseBulletinRequestFromUrlSearchParams(searchParams);
    const includeAllFilteredJobs = searchParams.get('all') === 'true';

    let userId: string | null = null;
    if (MATCH_SORT_OPTIONS.has(parsedRequest.sortBy as any)) {
      const auth = await getRequestUser();
      if (auth.ok) {
        userId = auth.user.id;
      }
    }

    const data = await queryBulletinJobs({
      locale,
      request: parsedRequest,
      userId,
      includeFilterOptions: true,
      includeAllFilteredJobs,
    });

    const responseHeaders = userId ? NO_STORE_HEADERS : PUBLIC_CACHE_HEADERS;

    return NextResponse.json(
      {
        jobs: data.jobs,
        lastScrapeTime: data.lastScrapeTime,
        skillLabels: data.skillLabels,
        filteredJobsCount: data.filteredJobsCount,
        totalJobsCount: data.totalJobsCount,
        totalPages: data.totalPages,
        currentPage: data.currentPage,
        filterOptions: data.filterOptions,
      },
      {
        headers: responseHeaders,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch bulletin';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
