import 'server-only';

import { supabaseServer } from '@/lib/supabase-server';
import { BULLETIN_MAX_AGE_DAYS } from '@/lib/bulletin/constants';
import { ORG_JOBS_PER_PAGE } from './constants';
import type { OrgIndexEntry, OrgJobPosting, OrgRecord } from './types';

export async function fetchOrganizationIndex(locale: 'en' | 'fr'): Promise<OrgIndexEntry[]> {
  const minDate = new Date(Date.now() - BULLETIN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Use the RPC to fetch organizations with their active job counts
  const { data: orgs, error } = await supabaseServer
    .rpc('get_active_organizations', { min_date: minDate });

  if (error) {
    console.error('fetchOrganizationIndex error:', error);
    throw new Error('Failed to fetch organization index');
  }

  // The RPC returns exactly what OrgIndexEntry expects
  return (orgs || []) as OrgIndexEntry[];
}

export async function fetchOrganizationDetail(
  slug: string,
  page: number,
  locale: 'en' | 'fr'
): Promise<{ org: OrgRecord; jobs: OrgJobPosting[]; total: number } | null> {
  const minDate = new Date(Date.now() - BULLETIN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const limit = ORG_JOBS_PER_PAGE;
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
    throw new Error('Failed to fetch jobs for organization detail');
  }

  return {
    org,
    jobs: jobs || [],
    total: count || 0,
  };
}
