import type { SupabaseClient } from '@supabase/supabase-js';
import type { BulletinFilters, JobSortOption } from '@/lib/bulletin/types';

/** Columns selected from the jobs_with_match_scores View. */
export const JOBS_VIEW_COLUMNS = [
  'id',
  'job_title',
  'organization',
  'location',
  'municipality',
  'province',
  'work_type',
  'date_posted',
  'close_date',
  'wage',
  'listing_url',
  'employment_type',
  'summary',
  'is_sse',
  'source_name',
  'values',
  'skills',
  'unit_text',
  'min_value',
  'max_value',
  'hours_per_week',
  'match_score',
  'match_value_score',
  'match_skill_score',
].join(', ');

const ITEMS_PER_PAGE = 20;

/** Jobs older than this are never shown in the bulletin. */
const JOBS_MAX_AGE_DAYS = 28;

/**
 * Maps a sort option to the Supabase `.order()` call parameters.
 */
function getSortColumn(sortBy: JobSortOption): { column: string; ascending: boolean } {
  switch (sortBy) {
    case 'date-desc':
      return { column: 'date_posted', ascending: false };
    case 'date-asc':
      return { column: 'date_posted', ascending: true };
    case 'salary-desc':
      return { column: 'min_value', ascending: false };
    case 'salary-asc':
      return { column: 'min_value', ascending: true };
    case 'org-asc':
      return { column: 'organization', ascending: true };
    case 'match-desc':
      return { column: 'match_score', ascending: false };
    case 'value-match-desc':
      return { column: 'match_value_score', ascending: false };
    case 'skill-match-desc':
      return { column: 'match_skill_score', ascending: false };
    default:
      return { column: 'date_posted', ascending: false };
  }
}

/**
 * Sanitise a user-provided search term for use inside PostgREST `.or()` filters.
 *
 * PostgREST uses commas to separate filter clauses and dots/parens for
 * operator syntax. Un-escaped special characters break the entire query.
 */
export function sanitiseSearchTerm(raw: string): string {
  // Strip characters that are meaningful in PostgREST filter DSL
  return raw.replace(/[.,()\\]/g, '').trim();
}

export interface BulletinQueryParams {
  filters: BulletinFilters;
  sortBy: JobSortOption;
  page: number;
  locale: 'en' | 'fr';
}

export interface BulletinQueryResult {
  jobs: Record<string, unknown>[];
  totalCount: number;
}

/**
 * Builds and executes a Supabase query against the `jobs_with_match_scores` View.
 *
 * All filtering, sorting, and pagination happen at the database level.
 * The returned `totalCount` comes from PostgREST's `count: 'exact'` header.
 */
export async function queryBulletinJobs(
  supabase: SupabaseClient,
  params: BulletinQueryParams,
): Promise<BulletinQueryResult> {
  const { filters, sortBy, page } = params;

  // Start query with exact count for pagination

  let query = supabase.from('jobs_with_match_scores').select(JOBS_VIEW_COLUMNS, { count: 'exact' });

  // ── Max age filter (always applied) ──────────────────────────────────
  const cutoffDate = new Date(Date.now() - JOBS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  query = query.gte('date_posted', cutoffDate.toISOString());

  // ── Text search ──────────────────────────────────────────────────────
  if (filters.searchQuery) {
    const term = sanitiseSearchTerm(filters.searchQuery);
    if (term) {
      const pattern = `%${term}%`;
      query = query.or(
        [
          `job_title.ilike.${pattern}`,
          `organization.ilike.${pattern}`,
          `summary.ilike.${pattern}`,
          `location.ilike.${pattern}`,
          `municipality.ilike.${pattern}`,
          `province.ilike.${pattern}`,
        ].join(','),
      );
    }
  }

  // ── Array-based inclusion filters ────────────────────────────────────
  if (filters.selectedOrganizations.length > 0) {
    query = query.in('organization', filters.selectedOrganizations);
  }

  if (filters.selectedProvinces.length > 0) {
    query = query.in('province', filters.selectedProvinces);
  }

  if (filters.selectedMunicipalities.length > 0) {
    query = query.in('municipality', filters.selectedMunicipalities);
  }

  if (filters.selectedEmploymentTypes.length > 0) {
    query = query.in('employment_type', filters.selectedEmploymentTypes);
  }

  if (filters.selectedWorkTypes.length > 0) {
    query = query.in('work_type', filters.selectedWorkTypes);
  }

  if (filters.selectedSources.length > 0) {
    query = query.in('source_name', filters.selectedSources);
  }

  // ── Boolean filters ──────────────────────────────────────────────────
  if (filters.showOnlySse) {
    query = query.eq('is_sse', true);
  }

  if (!filters.showJobsWithoutSalary) {
    // Exclude jobs that have neither a wage string nor a numeric min_value
    query = query.or('wage.neq.,min_value.not.is.null');
  }

  // ── Posted-within date filter ────────────────────────────────────────
  if (filters.postedWithin && filters.postedWithin !== 'any') {
    const daysMap: Record<string, number> = {
      '1-week': 7,
      '2-weeks': 14,
      '3-weeks': 21,
      '1-month': 30,
    };
    const days = daysMap[filters.postedWithin];
    if (days) {
      const postedCutoff = new Date((filters.now ?? Date.now()) - days * 24 * 60 * 60 * 1000);
      query = query.gte('date_posted', postedCutoff.toISOString());
    }
  }

  // ── Sorting ──────────────────────────────────────────────────────────
  const { column, ascending } = getSortColumn(sortBy);
  query = query.order(column, { ascending, nullsFirst: false });

  // Secondary sort to ensure stable pagination when primary values are identical
  if (column !== 'date_posted') {
    query = query.order('date_posted', { ascending: false });
  }

  // ── Pagination ───────────────────────────────────────────────────────
  const offset = (page - 1) * ITEMS_PER_PAGE;
  query = query.range(offset, offset + ITEMS_PER_PAGE - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(error.message);

  return {
    jobs: (data ?? []) as Record<string, unknown>[],
    totalCount: count ?? 0,
  };
}
