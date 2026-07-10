import type { SupabaseClient } from '@supabase/supabase-js';

type MutableJobOrgFields = {
  organization_id?: number | null;
  organization_slug?: string | null;
};

function jobsWithOrgFields(jobs: unknown): MutableJobOrgFields[] {
  if (!Array.isArray(jobs)) return [];

  return jobs.filter(
    (job): job is MutableJobOrgFields => job != null && typeof job === 'object',
  );
}

/**
 * Fetches organization slugs for jobs that have organization_id and mutates each
 * job in place with organization_slug.
 */
export async function resolveOrgSlugs(
  supabase: SupabaseClient,
  jobs: unknown,
): Promise<void> {
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
