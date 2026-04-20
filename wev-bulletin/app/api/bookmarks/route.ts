import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth/request-user';
import { unauthorizedResponse } from '@/lib/http-errors';
import { supabaseServer } from '@/lib/supabase-server';
import normalizeJobsWithSource from '@/lib/normalize-job';
import { resolveSkillLabels, attachSkillLabels, parseLocale } from '@/lib/resolve-skill-labels';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BOOKMARK_JOB_FIELDS =
  'id, job_title, organization, location, municipality, province, work_type, date_posted, close_date, wage, listing_url, employment_type, summary, is_sse, source_id, sources(name), values, skills';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const locale = parseLocale(searchParams.get('locale'));

    const auth = await getRequestUser();
    if (!auth.ok) {
      return unauthorizedResponse('Not authenticated');
    }

    const { user } = auth;
    const adminClient = supabaseServer;
    const { data: bookmarkRows, error: bookmarksError } = await adminClient
      .from('bookmarks')
      .select('job_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (bookmarksError) {
      return NextResponse.json({ error: bookmarksError.message }, { status: 500 });
    }

    const jobIds = Array.from(
      new Set(
        (bookmarkRows ?? [])
          .map((row) => row.job_id)
          .filter((jobId): jobId is string => typeof jobId === 'string' && jobId.length > 0),
      ),
    );

    if (jobIds.length === 0) {
      return NextResponse.json({ jobs: [] });
    }

    const { data: bookmarkedJobs, error: jobsError } = await adminClient
      .from('jobs')
      .select(BOOKMARK_JOB_FIELDS)
      .in('id', jobIds);

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 500 });
    }

    const jobsById = new Map<string, unknown>(
      (bookmarkedJobs ?? []).map((job) => [String((job as { id: string }).id), job]),
    );
    const data = jobIds
      .map((jobId) => jobsById.get(jobId))
      .filter((job): job is Record<string, unknown> => job != null);

    const jobsWithSource = normalizeJobsWithSource(data);
    const labelMap = await resolveSkillLabels(adminClient, jobsWithSource, locale);
    const jobs = attachSkillLabels(jobsWithSource, labelMap);

    return NextResponse.json({ jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch bookmarked jobs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
