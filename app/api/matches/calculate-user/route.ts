import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { requireAdminResponse } from '@/lib/auth/require-admin';
import { logger } from '@/lib/logger';
import { calculateUserMatches } from '@/lib/match-calculator';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const denied = await requireAdminResponse();
    if (denied) return denied;

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Verify the user exists (service role bypasses RLS so any profile id is visible to admins)
    const supabase = getSupabaseServer();
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Calculate matches for this user
    await calculateUserMatches(userId);

    return NextResponse.json({ success: true, message: 'User matches calculated' });
  } catch (error) {
    logger.error({ err: error }, 'Error in calculate-user match route');
    return NextResponse.json({ error: 'Failed to calculate user matches' }, { status: 500 });
  }
}
