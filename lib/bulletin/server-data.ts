import 'server-only';

import { unstable_cache } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';
import normalizeJobsWithSource from '@/lib/normalize-job';
import { resolveSkillLabels, attachSkillLabels } from '@/lib/resolve-skill-labels';
import type { JobMatchData, JobPosting } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase/profiles';

export const BULLETIN_CACHE_TAG = 'bulletin-jobs';

/** Jobs older than this are never shown in the bulletin. */
const JOBS_MAX_AGE_MS = 28 * 24 * 60 * 60 * 1000;

/**
 * Fetches and normalizes all bulletin jobs. Cached server-side for 5 minutes,
 * busted by /api/revalidate-jobs after a scrape. En/fr cached separately via args.
 */
export const fetchBulletinJobs = unstable_cache(
  async (locale: 'en' | 'fr') => {
    const [scrapeResult, jobsResult] = await Promise.all([
      supabaseServer
        .from('scrape_runs')
        .select('run_at')
        .order('run_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseServer
        .from('jobs')
        .select(
          'id, job_title, organization, location, municipality, province, work_type, date_posted, close_date, wage, listing_url, employment_type, summary, is_sse, source_id, sources(name), values, skills, unit_text, min_value, max_value, hours_per_week',
        )
        .gte('date_posted', new Date(Date.now() - JOBS_MAX_AGE_MS).toISOString())
        .order('date_posted', { ascending: false }),
    ]);

    if (scrapeResult.error) throw new Error(scrapeResult.error.message);
    if (jobsResult.error) throw new Error(jobsResult.error.message);

    const jobsWithSource = normalizeJobsWithSource(jobsResult.data);
    const labelMap = await resolveSkillLabels(supabaseServer, jobsWithSource, locale);

    return {
      jobs: jobsWithSource as unknown as JobPosting[],
      lastScrapeTime: scrapeResult.data?.run_at ?? null,
      skillLabels: Object.fromEntries(labelMap),
    };
  },
  [BULLETIN_CACHE_TAG],
  { tags: [BULLETIN_CACHE_TAG], revalidate: 300 },
);

/**
 * Serializable match data shape for Server → Client Component prop transfer.
 * Maps are not JSON-serializable; we use Record instead.
 */
export type SerializedMatchData = Record<string, JobMatchData>;

/**
 * Fetches ALL job_match rows for a user (no job_id filter) so this can run
 * in parallel with the jobs fetch. The caller filters to relevant job IDs.
 */
export async function fetchServerMatchData(userId: string): Promise<SerializedMatchData> {
  try {
    const { data, error } = await supabaseServer
      .from('job_matches')
      .select(
        'job_id, score, value_score, skill_score, work_type_score, location_score, shared_values, shared_skills',
      )
      .eq('user_id', userId);

    if (error || !data) return {};

    const result: SerializedMatchData = {};
    for (const row of data as Array<{
      job_id: string;
      score: number;
      value_score: number | null;
      skill_score: number | null;
      work_type_score: number | null;
      location_score: number | null;
      shared_values: string[];
      shared_skills: string[] | null;
    }>) {
      result[row.job_id] = {
        score: row.score,
        value_score: row.value_score,
        skill_score: row.skill_score,
        work_type_score: row.work_type_score,
        location_score: row.location_score,
        shared_values: row.shared_values ?? [],
        shared_skills: row.shared_skills ?? [],
      };
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Fetches ALL bookmarks for a user so this can run in parallel with the jobs fetch.
 * Returns bookmark job IDs as a plain string array (serializable).
 */
export async function fetchServerBookmarks(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabaseServer
      .from('bookmarks')
      .select('job_id')
      .eq('user_id', userId);

    if (error || !data) return [];
    return (data as Array<{ job_id: string }>).map((b) => b.job_id);
  } catch {
    return [];
  }
}

/**
 * Fetches a user's profile via the service-role client (bypasses RLS).
 * Used server-side in the page Server Component.
 */
export async function fetchServerProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabaseServer
      .from('profiles')
      .select(
        'id, full_name, bio, values, values_rated, skills, skills_rated, work_types, lat, lng, municipality, province, location_display_name, profile_photo_url, created_at, updated_at',
      )
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return null;
    return data as Profile;
  } catch {
    return null;
  }
}
