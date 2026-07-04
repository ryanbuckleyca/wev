import 'server-only';

import { supabaseServer } from '@/lib/supabase-server';
import { BULLETIN_MAX_AGE_DAYS } from '@/lib/bulletin/constants';
import type { OrgIndexEntry, OrgJobPosting, OrgRecord } from './types';

export async function fetchOrganizationIndex(locale: 'en' | 'fr'): Promise<OrgIndexEntry[]> {
  const minDate = new Date(Date.now() - BULLETIN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // 1. Fetch all active jobs within age window that have an organization_id
  const { data: jobs, error: jobsError } = await supabaseServer
    .from('jobs')
    .select('organization_id')
    .not('organization_id', 'is', null)
    .gte('date_posted', minDate);

  if (jobsError) {
    console.error('fetchOrganizationIndex jobs error:', jobsError);
    return [];
  }

  if (!jobs || jobs.length === 0) return [];

  // 2. Aggregate counts by organization_id
  const orgCounts = new Map<number, number>();
  for (const job of jobs) {
    const orgId = job.organization_id;
    if (orgId) {
      orgCounts.set(orgId, (orgCounts.get(orgId) || 0) + 1);
    }
  }

  // 3. Fetch the referenced organizations
  const orgIds = Array.from(orgCounts.keys());
  const { data: orgs, error: orgsError } = await supabaseServer
    .from('organizations')
    .select('*')
    .in('id', orgIds)
    .order('name', { ascending: true });

  if (orgsError) {
    console.error('fetchOrganizationIndex orgs error:', orgsError);
    return [];
  }

  // 4. Attach counts and return
  return (orgs || []).map((org: OrgRecord) => ({
    ...org,
    active_job_count: orgCounts.get(org.id) || 0,
  }));
}

export async function fetchOrganizationDetail(
  slug: string,
  page: number,
  locale: 'en' | 'fr'
): Promise<{ org: OrgRecord; jobs: OrgJobPosting[]; total: number } | null> {
  const minDate = new Date(Date.now() - BULLETIN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const limit = 20;
  const offset = (page - 1) * limit;

  // 1. Fetch org by slug
  const { data: org, error: orgError } = await supabaseServer
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .single();

  if (orgError || !org) {
    return null; // Org not found or db error
  }

  // 2. Fetch paginated active jobs for this org
  const { data: jobs, error: jobsError, count } = await supabaseServer
    .from('jobs')
    .select('id, job_title, listing_url, date_posted, employment_type, location, work_type', {
      count: 'exact',
    })
    .eq('organization_id', org.id)
    .gte('date_posted', minDate)
    .order('date_posted', { ascending: false })
    .range(offset, offset + limit - 1);

  if (jobsError) {
    console.error('fetchOrganizationDetail jobs error:', jobsError);
    return { org, jobs: [], total: 0 };
  }

  return {
    org,
    jobs: jobs || [],
    total: count || 0,
  };
}
