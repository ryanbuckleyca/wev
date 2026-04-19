/**
 * Bulletin filter and sort type definitions.
 *
 * These types are used by both the client-side filter UI (useBulletinFilters)
 * and the server-side query builder (query-builder.ts). The actual filtering
 * and sorting logic now lives in the database via the jobs_with_match_scores View.
 */

export const POSTED_WITHIN_FILTER_OPTIONS = [
  '1-week',
  '2-weeks',
  '3-weeks',
  '1-month',
  'any',
] as const;

export type PostedWithinSelection = (typeof POSTED_WITHIN_FILTER_OPTIONS)[number];

export const JOB_SORT_OPTIONS = [
  'date-desc',
  'date-asc',
  'match-desc',
  'value-match-desc',
  'skill-match-desc',
  'salary-desc',
  'salary-asc',
  'org-asc',
] as const;

export type JobSortOption = (typeof JOB_SORT_OPTIONS)[number];

export type BulletinFilters = {
  searchQuery: string;
  selectedOrganizations: string[];
  selectedProvinces: string[];
  selectedMunicipalities: string[];
  selectedEmploymentTypes: string[];
  selectedSources: string[];
  selectedWorkTypes: string[];
  showOnlySse: boolean;
  showJobsWithoutSalary: boolean;
  postedWithin: PostedWithinSelection;
  now?: number;
};
