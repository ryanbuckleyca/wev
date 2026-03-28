import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { unauthorizedResponse } from '@/lib/http-errors';
import { logger } from '@/lib/logger';

/**
 * On-demand revalidation endpoint for ESCO skills cache
 * Call this endpoint after updating ESCO skills in the database
 *
 * Usage: POST /api/skills/revalidate?secret=YOUR_SECRET_TOKEN
 */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');

    // Verify secret token (set this in your environment variables)
    if (secret !== process.env.REVALIDATION_SECRET) {
      return unauthorizedResponse('Invalid secret');
    }

    // Revalidate the skills cache
    revalidatePath('/api/skills/all');

    return NextResponse.json({
      revalidated: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, 'Skills revalidation error');
    return NextResponse.json({ error: 'Failed to revalidate' }, { status: 500 });
  }
}
