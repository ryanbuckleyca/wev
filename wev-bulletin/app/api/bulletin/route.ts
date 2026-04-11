import { NextResponse } from 'next/server';
import { fetchBulletinJobs, BULLETIN_CACHE_TAG } from '@/lib/bulletin/server-data';
import { parseLocale } from '@/lib/resolve-skill-labels';

// Re-export so /api/revalidate-jobs can reference the same tag.
export { BULLETIN_CACHE_TAG };

// NOTE: force-dynamic intentionally removed. The response now carries
// Cache-Control headers so browsers and any CDN layer can cache it for
// 5 minutes, serving stale while revalidating in the background.
// unstable_cache inside fetchBulletinJobs handles server-side DB caching.

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const locale = parseLocale(searchParams.get('locale'));

    const data = await fetchBulletinJobs(locale);

    return NextResponse.json(
      { jobs: data.jobs, lastScrapeTime: data.lastScrapeTime, skillLabels: data.skillLabels },
      {
        headers: {
          // Browsers/CDN: serve fresh for 5 min, then stale-while-revalidating.
          // The explicit refresh() call in useBulletinData uses cache:'no-cache'
          // to bypass this when the admin triggers a manual re-scrape.
          'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60',
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch bulletin';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
