import type { PostgrestFilterBuilder } from '@supabase/postgrest-js';
import { type BulletinFilters, type JobSortOption } from '@/lib/bulletin/job-query';
import { JOBS_MAX_AGE_MS, POSTED_WITHIN_DAYS } from './constants';

export function getRecentJobsCutoffIso(now = Date.now()): string {
  return new Date(now - JOBS_MAX_AGE_MS).toISOString();
}

/**
 * Escapes dots in search terms. PostgREST's .or() filter DSL uses '.' as a delimiter.
 * Without escaping, a search like "Sr. Developer" breaks the filter.
 */
export function sanitizeSearchTerm(raw: string): string {
  return raw
    .trim()
    .replace(/[(),.]/g, ' ')
    .replace(/[%_]/g, ' ')
    .replace(/\s+/g, ' ');
}

export function getPostedWithinCutoffIso(
  postedWithin: keyof typeof POSTED_WITHIN_DAYS | 'any',
  now = Date.now(),
): string | null {
  if (postedWithin === 'any') {
    return null;
  }

  const days = POSTED_WITHIN_DAYS[postedWithin as keyof typeof POSTED_WITHIN_DAYS];
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

export function applyFiltersToJobsQuery<
  Schema extends Record<string, any>,
  Row extends Record<string, any>,
  Result,
>(
  query: PostgrestFilterBuilder<Schema, Row, Result>,
  filters: BulletinFilters,
): PostgrestFilterBuilder<Schema, Row, Result> {
  const now = filters.now ?? Date.now();

  let next = query.gte('date_posted', getRecentJobsCutoffIso(now));

  const searchTerm = sanitizeSearchTerm(filters.searchQuery);
  if (searchTerm.length > 0) {
    next = next.or(
      [
        `job_title.ilike.%${searchTerm}%`,
        `summary.ilike.%${searchTerm}%`,
        `organization.ilike.%${searchTerm}%`,
        `location.ilike.%${searchTerm}%`,
        `municipality.ilike.%${searchTerm}%`,
        `province.ilike.%${searchTerm}%`,
      ].join(','),
    );
  }

  if (filters.selectedOrganizations.length > 0) {
    next = next.in('organization', filters.selectedOrganizations);
  }

  if (filters.selectedProvinces.length > 0) {
    next = next.in('province', filters.selectedProvinces);
  }

  if (filters.selectedMunicipalities.length > 0) {
    next = next.in('municipality', filters.selectedMunicipalities);
  }

  if (filters.selectedEmploymentTypes.length > 0) {
    next = next.in('employment_type', filters.selectedEmploymentTypes);
  }

  if (filters.selectedWorkTypes.length > 0) {
    next = next.in('work_type', filters.selectedWorkTypes);
  }

  if (filters.showOnlySse) {
    next = next.eq('is_sse', true);
  }

  const postedWithinCutoffIso = getPostedWithinCutoffIso(filters.postedWithin, now);
  if (postedWithinCutoffIso) {
    next = next.gte('date_posted', postedWithinCutoffIso);
  }

  return next;
}

export function applyDatabaseSort<
  Schema extends Record<string, any>,
  Row extends Record<string, any>,
  Result,
>(
  query: PostgrestFilterBuilder<Schema, Row, Result>,
  sortBy: JobSortOption,
): PostgrestFilterBuilder<Schema, Row, Result> {
  switch (sortBy) {
    case 'date-asc':
      return query.order('date_posted', { ascending: true, nullsFirst: false });
    case 'org-asc':
      return query
        .order('organization', { ascending: true, nullsFirst: false })
        .order('date_posted', { ascending: false, nullsFirst: false });
    case 'date-desc':
    default:
      return query.order('date_posted', { ascending: false, nullsFirst: false });
  }
}
