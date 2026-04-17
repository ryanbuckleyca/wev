import type { JobMatchData, JobPosting } from '@/lib/supabase';
import { toAnnual } from '@/lib/compensation/helpers';
import { parseDateMs } from '@/lib/date-utils';

export const BULLETIN_ITEMS_PER_PAGE = 20;

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

const POSTED_WITHIN_DAYS: Record<Exclude<PostedWithinSelection, 'any'>, number> = {
  '1-week': 7,
  '2-weeks': 14,
  '3-weeks': 21,
  '1-month': 30,
};

function normalizePostedTimestamp(raw: string): number {
  return parseDateMs(raw);
}

function getAnnualSortValue(job: JobPosting, missingValue: number): number {
  if (job.min_value != null && job.unit_text != null) {
    const annual = toAnnual(BigInt(job.min_value), job.unit_text, job.hours_per_week);
    return annual != null ? Number(annual) : missingValue;
  }
  return missingValue;
}

function matchesSearch(job: JobPosting, searchQuery: string): boolean {
  if (!searchQuery) return true;

  const query = searchQuery.toLowerCase();
  return Boolean(
    job.job_title.toLowerCase().includes(query) ||
    (job.summary && job.summary.toLowerCase().includes(query)) ||
    job.organization.toLowerCase().includes(query) ||
    (job.location && job.location.toLowerCase().includes(query)) ||
    (job.municipality && job.municipality.toLowerCase().includes(query)) ||
    (job.province && job.province.toLowerCase().includes(query)),
  );
}

function matchesNullableSelection(
  value: string | null | undefined,
  selectedValues: string[],
): boolean {
  if (selectedValues.length === 0) return true;
  if (!value) return false;
  return selectedValues.includes(value);
}

export function filterJobs(jobs: JobPosting[], filters: BulletinFilters): JobPosting[] {
  return jobs.filter((job) => {
    if (!matchesSearch(job, filters.searchQuery)) return false;

    if (
      filters.selectedOrganizations.length > 0 &&
      !filters.selectedOrganizations.includes(job.organization)
    ) {
      return false;
    }

    if (
      filters.selectedWorkTypes.length > 0 &&
      !filters.selectedWorkTypes.includes(job.work_type)
    ) {
      return false;
    }

    if (filters.showOnlySse && !job.is_sse) {
      return false;
    }

    if (!filters.showJobsWithoutSalary && !job.wage?.trim() && job.min_value == null) {
      return false;
    }

    if (filters.postedWithin !== 'any') {
      const cutoffMs =
        (filters.now ?? Date.now()) -
        POSTED_WITHIN_DAYS[filters.postedWithin] * 24 * 60 * 60 * 1000;
      const postedMs = normalizePostedTimestamp(job.date_posted);
      if (Number.isNaN(postedMs) || postedMs < cutoffMs) {
        return false;
      }
    }

    if (!matchesNullableSelection(job.province, filters.selectedProvinces)) {
      return false;
    }

    if (!matchesNullableSelection(job.municipality, filters.selectedMunicipalities)) {
      return false;
    }

    if (filters.selectedEmploymentTypes.length > 0) {
      if (!job.employment_type || !filters.selectedEmploymentTypes.includes(job.employment_type)) {
        return false;
      }
    }

    if (filters.selectedSources.length > 0) {
      if (!job.source || !filters.selectedSources.includes(job.source)) {
        return false;
      }
    }

    return true;
  });
}

export function sortJobs(
  jobs: JobPosting[],
  sortBy: JobSortOption,
  matchData: Map<string, JobMatchData>,
): JobPosting[] {
  return [...jobs].sort((a, b) => {
    switch (sortBy) {
      case 'date-desc':
        return parseDateMs(b.date_posted) - parseDateMs(a.date_posted);
      case 'date-asc':
        return parseDateMs(a.date_posted) - parseDateMs(b.date_posted);
      case 'match-desc':
        return (matchData.get(b.id)?.score ?? 0) - (matchData.get(a.id)?.score ?? 0);
      case 'value-match-desc':
        return (matchData.get(b.id)?.value_score ?? 0) - (matchData.get(a.id)?.value_score ?? 0);
      case 'skill-match-desc':
        return (matchData.get(b.id)?.skill_score ?? 0) - (matchData.get(a.id)?.skill_score ?? 0);
      case 'salary-desc':
        return getAnnualSortValue(b, -1) - getAnnualSortValue(a, -1);
      case 'salary-asc':
        return (
          getAnnualSortValue(a, Number.POSITIVE_INFINITY) -
          getAnnualSortValue(b, Number.POSITIVE_INFINITY)
        );
      case 'org-asc':
        return a.organization.localeCompare(b.organization);
      default:
        return 0;
    }
  });
}
