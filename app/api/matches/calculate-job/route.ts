import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { requireAdminResponse } from '@/lib/auth/require-admin';
import { logger } from '@/lib/logger';
import { calculateJobMatches } from '@/lib/match-calculator';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const denied = await requireAdminResponse();
    if (denied) return denied;

    const { jobId } = await request.json();

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    // Verify the job exists (service role; consistent with match-calculator)
    const supabase = getSupabaseServer();
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Calculate matches for this job
    await calculateJobMatches(jobId);

    return NextResponse.json({ success: true, message: 'Job matches calculated' });
  } catch (error) {
    logger.error({ err: error }, 'Error in calculate-job match route');
    return NextResponse.json({ error: 'Failed to calculate job matches' }, { status: 500 });
  }
}
