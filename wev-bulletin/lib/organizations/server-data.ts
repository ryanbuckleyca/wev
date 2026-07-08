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

  const hasFilters =
    Boolean(searchQuery) ||
    sseOnly ||
    provinces.length > 0 ||
    municipalities.length > 0 ||
    orgTypes.length > 0;

  // Run main query and unfiltered denominator count in parallel.
  // The denominator call uses p_limit:1 to return exactly one row carrying the
  // total_count scalar subquery result, with minimal data transfer.
  const denominatorParams = {
    min_date: minDate,
    p_search: null,
    p_sse_only: false,
    p_provinces: null,
    p_municipalities: null,
    p_org_types: null,
    p_limit: 1,
    p_offset: 0,
    p_user_id: null,
    p_sort: 'org-asc' as const,
  };

  const mainParams = {
    min_date: minDate,
    p_search: searchQuery || null,
    p_sse_only: sseOnly,
    p_provinces: provinces.length > 0 ? provinces : null,
    p_municipalities: municipalities.length > 0 ? municipalities : null,
    p_org_types: orgTypes.length > 0 ? orgTypes : null,
    p_limit: limit,
    p_offset: offset,
    p_user_id: userId,
    p_sort: effectiveSortBy,
  };

  const [mainResult, denominatorResult] = await Promise.all([
    supabaseServer.rpc('get_active_organizations', mainParams),
    hasFilters
      ? supabaseServer.rpc('get_active_organizations', denominatorParams)
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (mainResult.error) {
    throw new Error(`fetchOrganizationIndex RPC error: ${mainResult.error.message}`);
  }
  if (denominatorResult.error) {
    throw new Error(
      `fetchOrganizationIndex totalAvailable RPC error: ${denominatorResult.error.message}`,
    );
  }

  const orgs = mainResult.data;
  const total = orgs && orgs.length > 0 ? Number(orgs[0].total_count) : 0;

  // When filters are active the denominator query gives the unfiltered org count.
  // When no filters, total IS the unfiltered count.
  const totalAvailable = hasFilters
    ? (denominatorResult.data && denominatorResult.data.length > 0
        ? Number(denominatorResult.data[0].total_count)
        : total)
    : total;

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
    // Only surface filter values for organizations that currently have active jobs,
    // so users don't see provinces/types that would produce zero results.
    const minDate = bulletinAgeCutoffIso();
    const { data, error } = await supabaseServer
      .from('organizations')
      .select('type, province, municipality, jobs!inner(date_posted)')
      .gte('jobs.date_posted', minDate);

    if (error) {
      // Re-throw so the caller (page render) can surface the error rather than
      // silently showing blank filter options that look like a bug.
      throw new Error(`fetchOrganizationFilterOptions error: ${error.message}`);
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
