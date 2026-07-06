import 'server-only';

import { cache } from 'react';
import { supabaseServer } from '@/lib/supabase-server';
import { BULLETIN_MAX_AGE_DAYS } from '@/lib/bulletin/constants';
import { ORG_JOBS_PER_PAGE } from './constants';
import type { OrgIndexEntry, OrgJobPosting, OrgRecord } from './types';

function getMinDateIso(): string {
  return new Date(Date.now() - BULLETIN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function fetchOrganizationIndex(
  page: number = 1,
): Promise<{ orgs: OrgIndexEntry[]; total: number }> {
  if (page < 1) page = 1;
  const minDate = getMinDateIso();
  const limit = ORG_JOBS_PER_PAGE;
  const offset = (page - 1) * limit;

  const { data: activeJobs, error } = await supabaseServer
    .from('jobs')
    .select('organization_id')
    .not('organization_id', 'is', null)
    .gte('date_posted', minDate);

  if (error) {
    console.error('fetchOrganizationIndex error:', error);
    throw new Error('Failed to fetch organization index');
  }

  const countsByOrgId = new Map<number, number>();
  for (const row of activeJobs || []) {
    const orgId = row.organization_id;
    if (typeof orgId !== 'number') {
      console.warn('fetchOrganizationIndex: unexpected organization_id type', typeof orgId, orgId);
      continue;
    }
    countsByOrgId.set(orgId, (countsByOrgId.get(orgId) || 0) + 1);
  }

  if (countsByOrgId.size === 0) {
    return { orgs: [], total: 0 };
  }

  const orgIds = [...countsByOrgId.keys()];
  const { data: organizations, error: organizationsError } = await supabaseServer
    .from('organizations')
    .select('*')
    .in('id', orgIds);

  if (organizationsError) {
    console.error('fetchOrganizationIndex error:', organizationsError);
    throw new Error('Failed to fetch organization index');
  }

  const sortedOrgs = (organizations || [])
    .map((org) => ({
      ...org,
      active_job_count: countsByOrgId.get(org.id) || 0,
    }))
    .filter((org) => org.active_job_count > 0)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return {
    orgs: sortedOrgs.slice(offset, offset + limit) as OrgIndexEntry[],
    total: sortedOrgs.length,
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
    throw new Error(`Failed to fetch organization: ${error.message}`);
  }
  return org;
});

export async function getOrganizationJobs(
  orgId: number,
  page: number,
): Promise<{ jobs: OrgJobPosting[]; total: number }> {
  if (page < 1) page = 1;
  const minDate = getMinDateIso();
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
    console.error('getOrganizationJobs error:', error);
    throw new Error('Failed to fetch jobs for organization');
  }

  return {
    jobs: jobs || [],
    total: count || 0,
  };
}
