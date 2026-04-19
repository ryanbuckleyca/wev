import type { SupabaseClient, PostgrestFilterBuilder } from '@supabase/supabase-js';
import type { JobPosting } from '@/lib/supabase';
import type { BulletinFilters, JobSortOption } from '@/lib/bulletin/types';
import { BULLETIN_ITEMS_PER_PAGE, BULLETIN_MAX_AGE_DAYS } from '@/lib/bulletin/constants';

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
  'annual_min',
  'annual_max',
].join(', ');

/**
 * Returns a ISO date string representing N days ago.
 */
function getDateDaysAgo(days: number, fromDate?: number): string {
  const cutoff = new Date((fromDate ?? Date.now()) - days * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
}

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
      return { column: 'annual_min', ascending: false };
    case 'salary-asc':
      return { column: 'annual_min', ascending: true };
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
 */
export function sanitiseSearchTerm(raw: string): string {
  return raw.replace(/[.,()\\]/g, '').trim();
}

/**
 * Applies all bulletin filters to the Supabase query.
 */
function applyBulletinFilters(
  query: PostgrestFilterBuilder<Record<string, unknown>, Record<string, unknown>, unknown[]>,
  filters: BulletinFilters,
) {
  let q = query;

  // 1. Max age filter (always applied)
  q = q.gte('date_posted', getDateDaysAgo(BULLETIN_MAX_AGE_DAYS));

  // 2. Text search
  if (filters.searchQuery) {
    const term = sanitiseSearchTerm(filters.searchQuery);
    if (term) {
      const pattern = `%${term}%`;
      q = q.or(
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

  // 3. Inclusion filters (Inclusion array filters)
  const inclusionFilters = [
    { key: 'organization', values: filters.selectedOrganizations },
    { key: 'province', values: filters.selectedProvinces },
    { key: 'municipality', values: filters.selectedMunicipalities },
    { key: 'employment_type', values: filters.selectedEmploymentTypes },
    { key: 'work_type', values: filters.selectedWorkTypes },
    { key: 'source_name', values: filters.selectedSources },
  ];

  for (const { key, values } of inclusionFilters) {
    if (values.length > 0) {
      q = q.in(key, values);
    }
  }

  // 4. Boolean/Flags
  if (filters.showOnlySse) {
    q = q.eq('is_sse', true);
  }

  if (!filters.showJobsWithoutSalary) {
    q = q.or('wage.neq.,annual_min.not.is.null');
  }

  // 5. Time-based filter
  if (filters.postedWithin && filters.postedWithin !== 'any') {
    const daysMap: Record<string, number> = {
      '1-week': 7,
      '2-weeks': 14,
      '3-weeks': 21,
      '1-month': 30,
    };
    const days = daysMap[filters.postedWithin];
    if (days) {
      q = q.gte('date_posted', getDateDaysAgo(days, filters.now));
    }
  }

  return q;
}

/**
 * Maps raw View rows to the public JobPosting domain model.
 * Handles database-specific column renames like source_name -> source.
 */
function mapRowsToJobs(rows: Record<string, unknown>[]): JobPosting[] {
  return rows.map((row) => {
    const {
      source_name,
      // Strip internal scoring columns that aren't part of the JobPosting type yet
      match_score: _s1,
      match_value_score: _s2,
      match_skill_score: _s3,
      annual_min: _s4,
      annual_max: _s5,
      ...rest
    } = row;

    return {
      ...(rest as JobPosting),
      source: (source_name as string) ?? null,
    };
  });
}

export interface BulletinQueryParams {
  filters: BulletinFilters;
  sortBy: JobSortOption;
  page: number;
  locale: 'en' | 'fr';
}

export interface BulletinQueryResult {
  jobs: JobPosting[];
  totalCount: number;
}

/**
 * Builds and executes a Supabase query against the `jobs_with_match_scores` View.
 */
export async function queryBulletinJobs(
  supabase: SupabaseClient,
  params: BulletinQueryParams,
): Promise<BulletinQueryResult> {
  const { filters, sortBy, page } = params;

  // Initial select with count
  let query = supabase.from('jobs_with_match_scores').select(JOBS_VIEW_COLUMNS, { count: 'exact' });

  // Apply filtering logic
  query = applyBulletinFilters(
    query as unknown as PostgrestFilterBuilder<
      Record<string, unknown>,
      Record<string, unknown>,
      unknown[]
    >,
    filters,
  );

  // Apply sorting
  const { column, ascending } = getSortColumn(sortBy);
  query = query.order(column, { ascending, nullsFirst: false });

  // Stable pagination tie-breakers
  if (column !== 'date_posted') {
    query = query.order('date_posted', { ascending: false });
  }
  query = query.order('id', { ascending: true }); // Tertiary sort for absolute stability

  // Apply pagination
  const offset = (page - 1) * BULLETIN_ITEMS_PER_PAGE;
  query = query.range(offset, offset + BULLETIN_ITEMS_PER_PAGE - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(error.message);

  return {
    jobs: mapRowsToJobs(data ?? []),
    totalCount: count ?? 0,
  };
}
