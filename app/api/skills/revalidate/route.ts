import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

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
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
    }

    // Revalidate the skills cache
    revalidatePath('/api/skills/all');

    return NextResponse.json({
      revalidated: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Revalidation error:', err);
    return NextResponse.json({ error: 'Failed to revalidate' }, { status: 500 });
  }
}
