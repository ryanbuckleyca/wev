import type { SupabaseClient } from '@supabase/supabase-js';

type MutableJobOrgFields = {
  organization_id?: number | null;
  organization_slug?: string | null;
};

function jobsWithOrgFields(jobs: unknown): MutableJobOrgFields[] {
  if (!Array.isArray(jobs)) return [];

  return jobs.filter((job): job is MutableJobOrgFields => job != null && typeof job === 'object');
}

/**
 * Attach organization_slug to each job that has organization_id.
 *
 * Uses one batched organizations query (IN over unique ids), not per-job lookups.
 */
export async function resolveOrgSlugs(supabase: SupabaseClient, jobs: unknown): Promise<void> {
  const mutableJobs = jobsWithOrgFields(jobs);
  if (mutableJobs.length === 0) return;

  const orgIds = [
    ...new Set(
      mutableJobs
        .map((job) => job.organization_id)
        .filter((id): id is number => typeof id === 'number'),
    ),
  ];
  if (orgIds.length === 0) return;

  const { data, error } = await supabase.from('organizations').select('id, slug').in('id', orgIds);
  if (error) {
    console.error('[resolveOrgSlugs] Failed to fetch organization slugs:', error);
    return;
  }

  const slugMap = new Map<number, string>();
  for (const row of data ?? []) {
    slugMap.set(row.id, row.slug);
  }

  for (const job of mutableJobs) {
    if (typeof job.organization_id === 'number') {
      job.organization_slug = slugMap.get(job.organization_id) ?? null;
    }
  }
}
