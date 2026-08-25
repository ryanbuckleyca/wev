import 'server-only';

import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase-server';
import { bulletinAgeCutoffIso } from '@/lib/bulletin/constants';
import { attachSkillLabels, parseLocale, resolveSkillLabels } from '@/lib/resolve-skill-labels';
import { ORG_INDEX_PAGE_SIZE, ORG_JOBS_PER_PAGE } from './constants';
import type { OrgIndexEntry, OrgJobPosting, OrgRecord } from './types';

// ---------------------------------------------------------------------------
// Activity-window helpers
// ---------------------------------------------------------------------------

/** Maps an activityDays value to the min_date RPC parameter. */
export function activityDaysToMinDate(
  activityDays: number | null | undefined,
  now: number = Date.now(),
): string | null {
  if (activityDays == null) return null; // "All organisations" — no date filter
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - activityDays);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

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
  languages?: string[];
  sectors?: string[];
  userId?: string | null;
  sortBy?: string | null;
  /** null/undefined = all orgs (full directory), 28 = last 4 weeks, 90 = last 3 months */
  activityDays?: number | null;
}

export async function fetchOrganizationIndex(
  options: FetchOrganizationIndexOptions = {},
  /** User-scoped client so get_active_organizations can read auth.uid() for value scores. */
  authSupabase?: SupabaseClient,
): Promise<{ orgs: OrgIndexEntry[]; total: number; totalAvailable: number }> {
  const {
    page: rawPage = 1,
    searchQuery = '',
    sseOnly = true,
    provinces = [],
    municipalities = [],
    orgTypes = [],
    languages = [],
    sectors = [],
    userId = null,
    sortBy = null,
    activityDays = null,
  } = options;

  const page = Math.max(1, rawPage);
  const minDate = activityDaysToMinDate(activityDays);
  const limit = ORG_INDEX_PAGE_SIZE;
  const offset = (page - 1) * limit;
  const effectiveSortBy = sortBy ?? (userId ? 'value-match-desc' : 'org-asc');

  // Product default is SSE-only; that is the baseline universe, not a "filter".
  // Denominator matches the current SSE scope with no search/geo/type/sector chips.
  const hasUserFilters =
    Boolean(searchQuery) ||
    provinces.length > 0 ||
    municipalities.length > 0 ||
    orgTypes.length > 0 ||
    languages.length > 0 ||
    sectors.length > 0;

  // Run main query and baseline denominator count in parallel.
  // The denominator call uses p_limit:1 to return exactly one row carrying the
  // total_count scalar subquery result, with minimal data transfer.
  const denominatorParams = {
    min_date: minDate,
    p_search: null,
    p_sse_only: sseOnly,
    p_provinces: null,
    p_municipalities: null,
    p_org_types: null,
    p_languages: null,
    p_sectors: null,
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
    p_languages: languages.length > 0 ? languages : null,
    p_sectors: sectors.length > 0 ? sectors : null,
    p_limit: limit,
    p_offset: offset,
    p_user_id: userId,
    p_sort: effectiveSortBy,
  };

  // RPC scores org value overlap via auth.uid(); service-role calls see no user.
  const mainRpcClient = userId && authSupabase ? authSupabase : supabaseServer;

  const [mainResult, denominatorResult] = await Promise.all([
    mainRpcClient.rpc('get_active_organizations', mainParams),
    hasUserFilters
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

  // When user filters are active the denominator is the baseline for this SSE scope.
  // When none are active, total IS that baseline count.
  const totalAvailable = hasUserFilters
    ? denominatorResult.data && denominatorResult.data.length > 0
      ? Number(denominatorResult.data[0].total_count)
      : total
    : total;

  // active_job_count should always be returned by the RPC (0 for no recent jobs),
  // regardless of min_date. If it's missing, the RPC shape is unexpected.
  if (orgs && orgs.length > 0 && orgs[0].active_job_count == null) {
    throw new Error(
      `fetchOrganizationIndex: RPC response missing active_job_count. First row: id=${orgs[0].id}, name=${orgs[0].name}`,
    );
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
  locale?: string;
}

export async function getOrganizationJobs({
  orgId,
  page: rawPage,
  locale = 'en',
}: GetOrganizationJobsOptions): Promise<{ jobs: OrgJobPosting[]; total: number }> {
  const page = Math.max(1, rawPage);
  const minDate = bulletinAgeCutoffIso();
  const limit = ORG_JOBS_PER_PAGE;
  const offset = (page - 1) * limit;

  const {
    data: jobs,
    error,
    count,
  } = await supabaseServer
    .from('jobs')
    .select(
      'id, job_title, listing_url, date_posted, employment_type, location, municipality, work_type, skills, values',
      {
        count: 'exact',
      },
    )
    .eq('organization_id', orgId)
    .gte('date_posted', minDate)
    .order('date_posted', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`getOrganizationJobs query error: ${error.message}`);
  }

  const rows = jobs || [];
  const labelMap = await resolveSkillLabels(supabaseServer, rows, parseLocale(locale));

  return {
    jobs: attachSkillLabels(rows, labelMap) as OrgJobPosting[],
    total: count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// fetchOrganizationFilterOptions
// ---------------------------------------------------------------------------

export interface OrganizationFilterOptions {
  types: string[];
  provinces: string[];
  municipalitiesByProvince: Record<string, string[]>;
  languages: string[];
  sectors: string[];
  availableTypes: string[];
  availableProvinces: string[];
  availableMunicipalitiesByProvince: Record<string, string[]>;
  availableLanguages: string[];
  availableSectors: string[];
}

/**
 * Returns the filter options (types, provinces, municipalities, languages)
 * for the org index. When activityDays is null (full directory / "All
 * organisations"), options are derived from all orgs. When activityDays is
 * set, options are scoped to orgs with jobs in that window.
 */
export const fetchOrganizationFilterOptions = cache(
  async (activityDays?: number | null): Promise<OrganizationFilterOptions> => {
    if (Number.isNaN(activityDays)) {
      throw new Error(
        `fetchOrganizationFilterOptions: invalid activityDays provided (got ${activityDays})`,
      );
    }

    const { data, error } = await supabaseServer.rpc('get_organization_filter_options', {
      p_activity_days: activityDays ?? null,
    });

    if (error) {
      throw new Error(`fetchOrganizationFilterOptions error: ${error.message}`);
    }

    // Helper to format the RPC response (handling the municipality mapping)
    const formatOptions = (raw: any) => {
      const types = Array.isArray(raw?.types) ? raw.types : [];
      const provinces = Array.isArray(raw?.provinces) ? raw.provinces : [];
      const languages = Array.isArray(raw?.languages) ? raw.languages : [];
      const sectors = Array.isArray(raw?.sectors) ? raw.sectors : [];
      const rawMunicipalities = Array.isArray(raw?.municipalities) ? raw.municipalities : [];

      const municipalitiesByProv: Record<string, Set<string>> = {};
      for (const m of rawMunicipalities) {
        if (!municipalitiesByProv[m.province]) {
          municipalitiesByProv[m.province] = new Set();
        }
        municipalitiesByProv[m.province].add(m.municipality);
      }

      const finalMunicipalities: Record<string, string[]> = {};
      // Sort municipalities within each province
      for (const prov in municipalitiesByProv) {
        finalMunicipalities[prov] = Array.from(municipalitiesByProv[prov]).sort();
      }

      return {
        types: types.sort(),
        provinces: provinces.sort(),
        languages: languages.sort(),
        sectors: sectors.sort(),
        municipalitiesByProvince: finalMunicipalities,
      };
    };

    const globalOptions = formatOptions(data?.global ?? {});
    const availableOptions = formatOptions(data?.available ?? {});

    return {
      types: globalOptions.types,
      provinces: globalOptions.provinces,
      municipalitiesByProvince: globalOptions.municipalitiesByProvince,
      languages: globalOptions.languages,
      sectors: globalOptions.sectors,
      availableTypes: availableOptions.types,
      availableProvinces: availableOptions.provinces,
      availableMunicipalitiesByProvince: availableOptions.municipalitiesByProvince,
      availableLanguages: availableOptions.languages,
      availableSectors: availableOptions.sectors,
    };
  },
);
