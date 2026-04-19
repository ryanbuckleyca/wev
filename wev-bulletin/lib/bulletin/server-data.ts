import 'server-only';

import { unstable_cache } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';
import normalizeJobsWithSource from '@/lib/normalize-job';
import { resolveSkillLabels } from '@/lib/resolve-skill-labels';
import type { JobMatchData, JobPosting } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase/profiles';

export const BULLETIN_CACHE_TAG = 'bulletin-jobs';

/** Jobs older than this are never shown in the bulletin. */
const JOBS_MAX_AGE_MS = 28 * 24 * 60 * 60 * 1000;

/**
 * Fetches and caches the last scrape time.
 */
export const fetchLastScrapeTime = unstable_cache(
  async () => {
    const { data, error } = await supabaseServer
      .from('scrape_runs')
      .select('run_at')
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data?.run_at ?? null;
  },
  ['bulletin-scrape-time'],
  { tags: [BULLETIN_CACHE_TAG], revalidate: 300 },
);

import { createClient } from '@/lib/supabase/server';

/**
 * Fetches the initial page of bulletin jobs for SSR.
 */
export async function fetchServerBulletinJobs(locale: 'en' | 'fr') {
  const supabase = await createClient();
  const [scrapeTime, jobsResult] = await Promise.all([
    fetchLastScrapeTime(),
    supabase
      .from('matched_jobs')
      .select('*', { count: 'exact' })
      .order('date_posted', { ascending: false })
      .range(0, 19),
  ]);

  if (jobsResult.error) throw new Error(jobsResult.error.message);

  const jobs = jobsResult.data as unknown as JobPosting[];
  const labelMap = await resolveSkillLabels(supabaseServer, jobs, locale);

  return {
    jobs,
    total: jobsResult.count ?? 0,
    lastScrapeTime: scrapeTime,
    skillLabels: Object.fromEntries(labelMap),
  };
}

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
