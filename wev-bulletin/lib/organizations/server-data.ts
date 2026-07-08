import 'server-only';

import { cache } from 'react';
import { supabaseServer } from '@/lib/supabase-server';
import { bulletinAgeCutoffIso } from '@/lib/bulletin/constants';
import { ORG_JOBS_PER_PAGE } from './constants';
import type { OrgIndexEntry, OrgJobPosting, OrgRecord } from './types';

// ---------------------------------------------------------------------------
// fetchOrganizationIndex
// ---------------------------------------------------------------------------

export interface FetchOrganizationIndexOptions {
  page?: number;
  searchQuery?: string;
  sseOnly?: boolean;
  provinces?: string[];
  municipalities?: string[];
  orgTypes?: string[];
  userId?: string | null;
  sortBy?: string | null;
}

export async function fetchOrganizationIndex(
  options: FetchOrganizationIndexOptions = {},
): Promise<{ orgs: OrgIndexEntry[]; total: number; totalAvailable: number }> {
  const {
    page: rawPage = 1,
    searchQuery = '',
    sseOnly = true,
    provinces = [],
    municipalities = [],
    orgTypes = [],
    userId = null,
    sortBy = null,
  } = options;

  const page = Math.max(1, rawPage);
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
  // The denominator call uses p_sse_only: false so the user sees
  // "5 SSE orgs of 30 total orgs" when only the SSE toggle is active.
  const needsDenominator = sseOnly || hasNonSseFilters;

  const rpcParams = {
    min_date: minDate,
    p_search: searchQuery || null,
    p_sse_only: sseOnly,
    p_provinces: provinces.length > 0 ? provinces : null,
    p_municipalities: municipalities.length > 0 ? municipalities : null,
    p_org_types: orgTypes.length > 0 ? orgTypes : null,
  };

  const { data: orgs, error } = await supabaseServer.rpc('get_active_organizations', {
    ...rpcParams,
    p_limit: limit,
    p_offset: offset,
    p_user_id: userId,
    p_sort: effectiveSortBy,
  });

  if (error) {
    throw new Error(`fetchOrganizationIndex RPC error: ${error.message}`);
  }

  // Fetch the unfiltered denominator count when needed (p_limit:1 to minimise data transfer).
  const { data: availableOrgs, error: availableError } = needsDenominator
    ? await supabaseServer.rpc('get_active_organizations', {
        ...rpcParams,
        p_limit: 1,
        p_offset: 0,
        p_sse_only: false,
        p_user_id: null,
        p_sort: 'org-asc',
      })
    : { data: orgs, error: null };

  if (availableError) {
    throw new Error(
      `fetchOrganizationIndex totalAvailable RPC error: ${availableError.message}`,
    );
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

// ---------------------------------------------------------------------------
// getOrganizationBySlug
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// getOrganizationJobs
// ---------------------------------------------------------------------------

export interface GetOrganizationJobsOptions {
  orgId: number;
  page: number;
  sseOnly?: boolean;
}

export async function getOrganizationJobs({
  orgId,
  page: rawPage,
  sseOnly = false,
}: GetOrganizationJobsOptions): Promise<{ jobs: OrgJobPosting[]; total: number; totalAvailable: number }> {
  const page = Math.max(1, rawPage);
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

  // Fetch the unfiltered total when SSE filter is active,
  // so we can display "5 / 30 jobs" instead of "5 / 5 jobs".
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

// ---------------------------------------------------------------------------
// fetchOrganizationFilterOptions
// ---------------------------------------------------------------------------

export interface OrganizationFilterOptions {
  types: string[];
  provinces: string[];
  municipalitiesByProvince: Record<string, string[]>;
}

export const fetchOrganizationFilterOptions = cache(
  async (): Promise<OrganizationFilterOptions> => {
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

    for (const org of data) {
      if (org.type) types.add(org.type);
      if (org.province) {
        provinces.add(org.province);
        if (org.municipality) {
          if (!municipalitiesByProv[org.province]) {
            municipalitiesByProv[org.province] = new Set<string>();
          }
          municipalitiesByProv[org.province].add(org.municipality);
        }
      }
    }

    const municipalitiesByProvince: Record<string, string[]> = {};
    for (const prov of Object.keys(municipalitiesByProv)) {
      municipalitiesByProvince[prov] = Array.from(municipalitiesByProv[prov]).sort();
    }

    return {
      types: Array.from(types).sort(),
      provinces: Array.from(provinces).sort(),
      municipalitiesByProvince,
    };
  },
);
