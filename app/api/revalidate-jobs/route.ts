import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { BULLETIN_CACHE_TAG } from '@/app/api/bulletin/route';

const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET;

/**
 * POST /api/revalidate-jobs
 *
 * Busts the bulletin jobs cache after a scrape run completes.
 * Called by the scraper or GitHub Actions workflow after new jobs are ingested.
 *
 * Requires Authorization: Bearer <REVALIDATE_SECRET> header.
 */
export async function POST(request: Request) {
  if (REVALIDATE_SECRET) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${REVALIDATE_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  revalidateTag(BULLETIN_CACHE_TAG);

  return NextResponse.json({ revalidated: true, tag: BULLETIN_CACHE_TAG });
}
