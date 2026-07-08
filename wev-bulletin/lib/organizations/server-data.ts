import 'server-only';

import { cache } from 'react';
import { supabaseServer } from '@/lib/supabase-server';
import { bulletinAgeCutoffIso } from '@/lib/bulletin/constants';
import { ORG_JOBS_PER_PAGE } from './constants';
import type { OrgIndexEntry, OrgJobPosting, OrgRecord } from './types';

export async function fetchOrganizationIndex(
  page: number = 1,
  searchQuery: string = '',
  sseOnly: boolean = true,
  provinces: string[] = [],
  municipalities: string[] = [],
  orgTypes: string[] = [],
  userId: string | null = null,
  sortBy: string | null = null,
): Promise<{ orgs: OrgIndexEntry[]; total: number; totalAvailable: number }> {
  if (page < 1) page = 1;
  const minDate = bulletinAgeCutoffIso();
  const limit = ORG_JOBS_PER_PAGE;
  const offset = (page - 1) * limit;
  const effectiveSortBy = sortBy ?? (userId ? 'value-match-desc' : 'org-asc');
  const hasNonSseFilters =
    Boolean(searchQuery) ||
    provinces.length > 0 ||
    municipalities.length > 0 ||
    orgTypes.length > 0;

  // We need a denominator for the "X of Y" count whenever anything is filtered.
  // The denominator is always fetched with p_sse_only: false so the user sees
  // "5 SSE orgs of 30 total orgs" when only the SSE toggle is active.
  const needsDenominator = sseOnly || hasNonSseFilters;

  const { data: orgs, error } = await supabaseServer.rpc('get_active_organizations', {
    min_date: minDate,
    p_limit: limit,
    p_offset: offset,
    p_search: searchQuery || null,
    p_sse_only: sseOnly,
    p_provinces: provinces.length > 0 ? provinces : null,
    p_municipalities: municipalities.length > 0 ? municipalities : null,
    p_org_types: orgTypes.length > 0 ? orgTypes : null,
    p_user_id: userId,
    p_sort: effectiveSortBy,
  });

  const { data: availableOrgs, error: availableError } = needsDenominator
    ? await supabaseServer.rpc('get_active_organizations', {
        min_date: minDate,
        p_limit: 1,
        p_offset: 0,
        p_search: searchQuery || null,
        p_sse_only: false,
        p_provinces: provinces.length > 0 ? provinces : null,
        p_municipalities: municipalities.length > 0 ? municipalities : null,
        p_org_types: orgTypes.length > 0 ? orgTypes : null,
        p_user_id: null,
        p_sort: 'org-asc',
      })
    : { data: orgs, error: null };

  if (error) {
    throw new Error(`fetchOrganizationIndex RPC error: ${error.message}`);
  }
  if (availableError) {
    throw new Error(`fetchOrganizationIndex totalAvailable RPC error: ${availableError.message}`);
  }

  const total = orgs && orgs.length > 0 ? Number(orgs[0].total_count) : 0;
  const totalAvailable =
    availableOrgs && availableOrgs.length > 0 ? Number(availableOrgs[0].total_count) : total;

  if (orgs && orgs.length > 0 && orgs[0].active_job_count == null) {
    throw new Error('fetchOrganizationIndex: RPC response missing active_job_count');
  }

  return {
    orgs: (orgs || []) as OrgIndexEntry[],
    total,
    totalAvailable,
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
  sseOnly: boolean = false,
): Promise<{ jobs: OrgJobPosting[]; total: number; totalAvailable: number }> {
  if (page < 1) page = 1;
  const minDate = bulletinAgeCutoffIso();
  const limit = ORG_JOBS_PER_PAGE;
  const offset = (page - 1) * limit;

  let query = supabaseServer
    .from('jobs')
    .select('id, job_title, listing_url, date_posted, employment_type, location, work_type', {
      count: 'exact',
    })
    .eq('organization_id', orgId)
    .gte('date_posted', minDate)
    .order('date_posted', { ascending: false })
    .range(offset, offset + limit - 1);

  if (sseOnly) {
    query = query.eq('is_sse', true);
  }

  const { data: jobs, error, count } = await query;

  if (error) {
    throw new Error(`getOrganizationJobs query error: ${error.message}`);
  }

  // Fetch unfiltered total (all active jobs for this org) when SSE filter is active,
  // so we can show "5 / 30 jobs" instead of "5 / 5 jobs".
  let totalAvailable = count ?? 0;
  if (sseOnly) {
    const { count: allCount, error: allError } = await supabaseServer
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('date_posted', minDate);
    if (allError) {
      throw new Error(`getOrganizationJobs totalAvailable query error: ${allError.message}`);
    }
    totalAvailable = allCount ?? 0;
  }

  return {
    jobs: jobs || [],
    total: count ?? 0,
    totalAvailable,
  };
}

export interface OrganizationFilterOptions {
  types: string[];
  provinces: string[];
  municipalitiesByProvince: Record<string, string[]>;
}

export const fetchOrganizationFilterOptions = cache(
  async (): Promise<OrganizationFilterOptions> => {
    // We only care about active organizations, but for simplicity of building filter options,
    // we can just query all organizations that have jobs.
    // However, picking all non-null provinces/municipalities/types from organizations is cheap.
    const { data, error } = await supabaseServer
      .from('organizations')
      .select('type, province, municipality');

    if (error) {
      console.error('fetchOrganizationFilterOptions error:', error);
      return { types: [], provinces: [], municipalitiesByProvince: {} };
    }

    const types = new Set<string>();
    const provinces = new Set<string>();
    const municipalitiesByProv: Record<string, Set<string>> = {};

    data.forEach((org) => {
      if (org.type) types.add(org.type);
      if (org.province) provinces.add(org.province);
      if (org.province && org.municipality) {
        if (!municipalitiesByProv[org.province]) {
          municipalitiesByProv[org.province] = new Set<string>();
        }
        municipalitiesByProv[org.province].add(org.municipality);
      }
    });

    const municipalitiesByProvince: Record<string, string[]> = {};
    for (const prov in municipalitiesByProv) {
      municipalitiesByProvince[prov] = Array.from(municipalitiesByProv[prov]).sort();
    }

    return {
      types: Array.from(types).sort(),
      provinces: Array.from(provinces).sort(),
      municipalitiesByProvince,
    };
  },
);
