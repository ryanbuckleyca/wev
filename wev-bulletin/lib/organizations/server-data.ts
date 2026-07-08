import 'server-only';

import { cache } from 'react';
import { supabaseServer } from '@/lib/supabase-server';
import { bulletinAgeCutoffIso } from '@/lib/bulletin/constants';
import { ORG_JOBS_PER_PAGE } from './constants';
import type { OrgIndexEntry, OrgJobPosting, OrgRecord } from './types';

export async function fetchOrganizationIndex(
  page: number = 1,
): Promise<{ orgs: OrgIndexEntry[]; total: number }> {
  if (page < 1) page = 1;
  const minDate = bulletinAgeCutoffIso();
  const limit = ORG_JOBS_PER_PAGE;
  const offset = (page - 1) * limit;

  const { data: orgs, error } = await supabaseServer.rpc('get_active_organizations', {
    min_date: minDate,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    throw new Error(`fetchOrganizationIndex RPC error: ${error.message}`);
  }

  const total = orgs && orgs.length > 0 ? Number(orgs[0].total_count) : 0;

  if (orgs && orgs.length > 0 && orgs[0].active_job_count == null) {
    throw new Error('fetchOrganizationIndex: RPC response missing active_job_count');
  }

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

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('getOrganizationBySlug error:', error);
    throw new Error(`getOrganizationBySlug query error: ${error.message}`);
  }
  return org;
});

export async function getOrganizationJobs(
  orgId: number,
  page: number,
): Promise<{ jobs: OrgJobPosting[]; total: number }> {
  if (page < 1) page = 1;
  const minDate = bulletinAgeCutoffIso();
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
    .gte('date_posted', minDate)
    .order('date_posted', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`getOrganizationJobs query error: ${error.message}`);
  }

  return {
    jobs: jobs || [],
    total: count || 0,
  };
}
