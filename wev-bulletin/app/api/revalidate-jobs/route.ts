import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { BULLETIN_CACHE_TAG } from '@/lib/bulletin/server-data';
 
export const dynamic = 'force-dynamic';

const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET ?? process.env.REVALIDATION_SECRET;
const BULLETIN_REVALIDATE_PATHS = ['/en', '/fr', '/en/jobs', '/fr/jobs', '/fr/emplois'] as const;

function revalidateBulletinPaths() {
  for (const path of BULLETIN_REVALIDATE_PATHS) {
    revalidatePath(path, 'page');
  }
}

/**
 * POST /api/revalidate-jobs
 *
 * Busts the bulletin jobs cache after a scrape run completes.
 * Called by the scraper or GitHub Actions workflow after new jobs are ingested.
 *
 * Requires Authorization: Bearer <REVALIDATE_SECRET> header.
 */
export async function POST(request: Request) {
  if (!REVALIDATE_SECRET) {
    console.warn(
      '[revalidate-jobs] REVALIDATE_SECRET (or REVALIDATION_SECRET) is not set — endpoint is disabled.',
    );
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${REVALIDATE_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  revalidateTag(BULLETIN_CACHE_TAG, 'default');
  revalidateBulletinPaths();

  return NextResponse.json({ revalidated: true, tag: BULLETIN_CACHE_TAG });
}
