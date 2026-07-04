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

export async function getOrganizationBySlug(slug: string): Promise<OrgRecord | null> {
  const { data: org, error } = await supabaseServer
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !org) {
    return null;
  }
  return org;
}

export async function getOrganizationJobs(
  orgId: number,
  page: number,
): Promise<{ jobs: OrgJobPosting[]; total: number }> {
  const minDate = new Date(Date.now() - BULLETIN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const limit = ORG_JOBS_PER_PAGE;
  const offset = (page - 1) * limit;

  const { data: jobs, error, count } = await supabaseServer
    .from('jobs')
    .select('id, job_title, listing_url, date_posted, employment_type, location, work_type', {
      count: 'exact',
    })
    .eq('organization_id', orgId)
    .gte('date_posted', minDate)
    .order('date_posted', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('getOrganizationJobs error:', error);
    throw new Error('Failed to fetch jobs for organization');
  }

  return {
    jobs: jobs || [],
    total: count || 0,
  };
}
