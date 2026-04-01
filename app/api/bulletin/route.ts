import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';
import normalizeJobsWithSource from '@/lib/normalize-job';
import { resolveSkillLabels, attachSkillLabels, parseLocale } from '@/lib/resolve-skill-labels';

export const dynamic = 'force-dynamic';
// force-dynamic prevents Next.js from statically rendering this route at build time.
// unstable_cache provides server-side data caching within a running process — these are
// complementary: force-dynamic = always run at request time, unstable_cache = cache the
// DB result across requests within the same process for up to 5 minutes.

export const BULLETIN_CACHE_TAG = 'bulletin-jobs';

/** Jobs older than this are never shown in the bulletin. Must be >= the max postedWithin filter option (1 month). */
const JOBS_MAX_AGE_MS = 28 * 24 * 60 * 60 * 1000;

// Full dataset — cached for 5 minutes, busted by /api/revalidate-jobs after a scrape.
const fetchAllBulletinData = unstable_cache(
  async (locale: 'en' | 'fr') => {
    const supabase = supabaseServer;

    const [scrapeResult, jobsResult] = await Promise.all([
      supabase
        .from('scrape_runs')
        .select('run_at')
        .order('run_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('jobs')
        .select(
          'id, job_title, organization, location, municipality, province, work_type, date_posted, close_date, wage, listing_url, employment_type, summary, is_sse, source_id, sources(name), values, skills, unit_text, min_value, max_value, hours_per_week, compensation_meta',
        )
        .gte('date_posted', new Date(Date.now() - JOBS_MAX_AGE_MS).toISOString())
        .order('date_posted', { ascending: false }),
    ]);

    if (scrapeResult.error) throw new Error(scrapeResult.error.message);
    if (jobsResult.error) throw new Error(jobsResult.error.message);

    const jobsWithSource = normalizeJobsWithSource(jobsResult.data);
    const labelMap = await resolveSkillLabels(supabase, jobsWithSource, locale);
    const jobs = attachSkillLabels(jobsWithSource, labelMap);

    return { jobs, lastScrapeTime: scrapeResult.data?.run_at ?? null };
  },
  [BULLETIN_CACHE_TAG],
  { tags: [BULLETIN_CACHE_TAG], revalidate: 300 },
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const locale = parseLocale(searchParams.get('locale'));
    const limit = parseInt(searchParams.get('limit') ?? '0', 10);

    const data = await fetchAllBulletinData(locale);

    // If a limit is requested, return only that slice — used for the fast first-page paint.
    // The full cached response is still built in the background for subsequent requests.
    if (limit > 0) {
      return NextResponse.json({
        jobs: data.jobs.slice(0, limit),
        lastScrapeTime: data.lastScrapeTime,
        total: data.jobs.length,
      });
    }

    return NextResponse.json({ jobs: data.jobs, lastScrapeTime: data.lastScrapeTime });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch bulletin';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
