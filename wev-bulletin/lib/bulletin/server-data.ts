import 'server-only';

import { unstable_cache } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';
import { resolveSkillLabels } from '@/lib/resolve-skill-labels';
import type { JobMatchData } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase/profiles';
import type { BulletinFilterOptions } from './filter-options';

export type { BulletinFilterOptions };

export const BULLETIN_CACHE_TAG = 'bulletin-meta';

/** Jobs older than this are never shown in the bulletin. */
const JOBS_MAX_AGE_MS = 28 * 24 * 60 * 60 * 1000;

/**
 * Fetches and caches all ESCO skill labels for jobs within the active window.
 * Cached server-side for 5 minutes, busted by revalidateTag after a scrape.
 * en/fr cached separately via the locale argument.
 */
export const fetchSkillLabels = unstable_cache(
  async (locale: 'en' | 'fr') => {
    const { data, error } = await supabaseServer
      .from('jobs')
      .select('skills')
      .gte('date_posted', new Date(Date.now() - JOBS_MAX_AGE_MS).toISOString());

    if (error) throw new Error(error.message);

    const jobsWithSkills = (data ?? []) as { skills: string[] | null }[];
    const labelMap = await resolveSkillLabels(supabaseServer, jobsWithSkills, locale);

    return Object.fromEntries(labelMap);
  },
  ['bulletin-skill-labels'],
  { tags: [BULLETIN_CACHE_TAG], revalidate: 300 },
);

/**
 * Fetches and caches the last scrape timestamp.
 * Cached server-side for 5 minutes.
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

/**
 * Fetches and caches the unique filter values for all active jobs.
 * Cached for 5 minutes.
 */
export const fetchBulletinFilterOptions = unstable_cache(
  async (): Promise<BulletinFilterOptions> => {
    const cutoff = new Date(Date.now() - JOBS_MAX_AGE_MS).toISOString();

    // Fetch distinct values for each filter category
    const [orgs, provs, munis, employ, srcs] = await Promise.all([
      supabaseServer
        .from('jobs')
        .select('organization')
        .gte('date_posted', cutoff)
        .not('organization', 'is', null)
        .order('organization', { ascending: true }),
      supabaseServer
        .from('jobs')
        .select('province')
        .gte('date_posted', cutoff)
        .not('province', 'is', null)
        .order('province', { ascending: true }),
      supabaseServer
        .from('jobs')
        .select('province, municipality')
        .gte('date_posted', cutoff)
        .not('municipality', 'is', null)
        .order('municipality', { ascending: true }),
      supabaseServer
        .from('jobs')
        .select('employment_type')
        .gte('date_posted', cutoff)
        .not('employment_type', 'is', null)
        .order('employment_type', { ascending: true }),
      supabaseServer.from('sources').select('name').order('name', { ascending: true }),
    ]);

    const organizations = Array.from(new Set((orgs.data ?? []).map((r) => r.organization))).filter(
      Boolean,
    ) as string[];
    const provinces = Array.from(new Set((provs.data ?? []).map((r) => r.province))).filter(
      Boolean,
    ) as string[];
    const employmentTypes = Array.from(
      new Set((employ.data ?? []).map((r) => r.employment_type)),
    ).filter(Boolean) as string[];
    const sources = (srcs.data ?? []).map((r) => r.name).filter(Boolean) as string[];

    const municipalitiesByProvince: Record<string, string[]> = {};
    (munis.data ?? []).forEach((r) => {
      if (!r.province || !r.municipality) return;
      if (!municipalitiesByProvince[r.province]) {
        municipalitiesByProvince[r.province] = [];
      }
      if (!municipalitiesByProvince[r.province].includes(r.municipality)) {
        municipalitiesByProvince[r.province].push(r.municipality);
      }
    });

    Object.keys(municipalitiesByProvince).forEach((p) => {
      municipalitiesByProvince[p].sort();
    });

    return {
      organizations,
      provinces,
      municipalitiesByProvince,
      employmentTypes,
      sources,
    };
  },
  ['bulletin-filter-options'],
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
