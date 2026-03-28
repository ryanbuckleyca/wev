import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateJobMatches } from '@/lib/match-calculator';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const { jobId } = await request.json();

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    // Verify the job exists
    const supabase = await createClient();
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
    console.error('Error calculating job matches:', error);
    return NextResponse.json({ error: 'Failed to calculate job matches' }, { status: 500 });
  }
}
