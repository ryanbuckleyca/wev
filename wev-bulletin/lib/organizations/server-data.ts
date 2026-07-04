import 'server-only';

import { cache } from 'react';
import { supabaseServer } from '@/lib/supabase-server';
import { BULLETIN_MAX_AGE_DAYS } from '@/lib/bulletin/constants';
import { ORG_JOBS_PER_PAGE } from './constants';
import type { OrgIndexEntry, OrgJobPosting, OrgRecord } from './types';

export async function fetchOrganizationIndex(
  page: number = 1,
): Promise<{ orgs: OrgIndexEntry[]; total: number }> {
  const minDate = new Date(Date.now() - BULLETIN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const limit = ORG_JOBS_PER_PAGE;
  const offset = (page - 1) * limit;

  // Use the RPC to fetch organizations with their active job counts
  const { data: orgs, error } = await supabaseServer.rpc('get_active_organizations', {
    min_date: minDate,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error('fetchOrganizationIndex error:', error);
    throw new Error('Failed to fetch organization index');
  }

  const total = orgs && orgs.length > 0 ? Number(orgs[0].total_count) : 0;

  // The RPC returns exactly what OrgIndexEntry expects
  return {
    orgs: (orgs || []) as OrgIndexEntry[],
    total,
  };
}

export const getOrganizationBySlug = cache(async (slug: string): Promise<OrgRecord | null> => {
  const { data: org, error } = await supabaseServer
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !org) {
    return null;
  }
  return org;
});

export async function getOrganizationJobs(
  orgId: number,
  page: number,
): Promise<{ jobs: OrgJobPosting[]; total: number }> {
  const minDate = new Date(Date.now() - BULLETIN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const limit = ORG_JOBS_PER_PAGE;
  const offset = (page - 1) * limit;

  const {
    data: jobs,
    error,
    count,
  } = await supabaseServer
    .from('jobs')
    .select('id, job_title, listing_url, date_posted, employment_type, location, work_type', {
      count: 'exact',
    })
    .eq('organization_id', orgId)
    .gte('scraped_at', minDate)
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
