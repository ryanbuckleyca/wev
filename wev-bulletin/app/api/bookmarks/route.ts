import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth/request-user';
import { unauthorizedResponse } from '@/lib/http-errors';
import { supabaseServer } from '@/lib/supabase-server';
import normalizeJobsWithSource from '@/lib/normalize-job';
import { resolveSkillLabels, attachSkillLabels, parseLocale } from '@/lib/resolve-skill-labels';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const locale = parseLocale(searchParams.get('locale'));

    const auth = await getRequestUser();
    if (!auth.ok) {
      return unauthorizedResponse('Not authenticated');
    }

    const { user } = auth;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('jobs_with_match_scores')
      .select('*, bookmarks!inner(user_id, created_at)')
      .eq('bookmarks.user_id', user.id)
      .order('date_posted', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // View returns source_name directly and handles match JOINs automatically
    const mappedJobs = (data ?? []).map((row) => {
      const { source_name, ...rest } = row as Record<string, unknown>;
      return {
        ...rest,
        source: source_name ?? null,
      };
    });

    const labelMap = await resolveSkillLabels(supabase, mappedJobs, locale);
    const jobs = attachSkillLabels(mappedJobs, labelMap);

    return NextResponse.json({ jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch bookmarked jobs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
