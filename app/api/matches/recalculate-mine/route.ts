import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateUserMatches } from '@/lib/match-calculator';
import { logger } from '@/lib/logger';
import { after } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/matches/recalculate-mine
 *
 * Recalculates job matches for the currently authenticated user.
 * Returns immediately — the heavy work runs after the response via `after()`,
 * so it never holds a connection open during navigation.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;

    // Return immediately — recalculation runs after the response is sent.
    after(async () => {
      try {
        await calculateUserMatches(userId);
      } catch (err) {
        logger.error({ err }, 'Background match recalculation failed');
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Error in recalculate-mine route');
    return NextResponse.json({ error: 'Failed to recalculate matches' }, { status: 500 });
  }
}
