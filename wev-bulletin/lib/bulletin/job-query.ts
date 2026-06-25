import type { JobMatchData, JobPosting } from '@/lib/supabase';
import { toAnnual } from '@/lib/compensation/helpers';
import { parseDateMs } from '@/lib/date-utils';

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
  selectedLanguages: string[];
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

function matchesSearch(job: JobPosting, query: string): boolean {
  if (!query) return true;
  return Boolean(
    job.job_title.toLowerCase().includes(query) ||
    (job.summary && job.summary.toLowerCase().includes(query)) ||
    job.organization.toLowerCase().includes(query) ||
    (job.location && job.location.toLowerCase().includes(query)) ||
    (job.municipality && job.municipality.toLowerCase().includes(query)) ||
    (job.province && job.province.toLowerCase().includes(query)),
  );
}

function matchesSelection<T>(
  value: T | null | undefined,
  selectedValues: T[],
): boolean {
  if (selectedValues.length === 0) return true;
  if (!value) return false;
  return selectedValues.includes(value);
}

export function filterJobs(jobs: JobPosting[], filters: BulletinFilters): JobPosting[] {
  const query = filters.searchQuery ? filters.searchQuery.toLowerCase() : '';
  const cutoffMs =
    filters.postedWithin !== 'any'
      ? (filters.now ?? Date.now()) - POSTED_WITHIN_DAYS[filters.postedWithin] * 24 * 60 * 60 * 1000
      : 0;
  
  const explicitlySeekingRemote = filters.selectedWorkTypes.includes('remote');

  return jobs.filter((job) => {
    if (!matchesSearch(job, query)) return false;

    if (!matchesSelection(job.organization, filters.selectedOrganizations)) return false;
    if (!matchesSelection(job.work_type, filters.selectedWorkTypes)) return false;
    if (!matchesSelection(job.language, filters.selectedLanguages)) return false;
    if (!matchesSelection(job.employment_type, filters.selectedEmploymentTypes)) return false;
    if (!matchesSelection(job.source, filters.selectedSources)) return false;

    if (filters.showOnlySse && !job.is_sse) return false;
    if (!filters.showJobsWithoutSalary && !job.wage?.trim() && job.min_value == null) return false;

    if (filters.postedWithin !== 'any') {
      const postedMs = normalizePostedTimestamp(job.date_posted);
      if (Number.isNaN(postedMs) || postedMs < cutoffMs) return false;
    }

    const bypassLocation = explicitlySeekingRemote && job.work_type === 'remote';

    if (!bypassLocation && !matchesSelection(job.province, filters.selectedProvinces)) return false;
    if (!bypassLocation && !matchesSelection(job.municipality, filters.selectedMunicipalities)) return false;

    return true;
  });
}

export function sortJobs(
  jobs: JobPosting[],
  sortBy: JobSortOption,
  matchData: Map<string, JobMatchData>,
): JobPosting[] {
  if (jobs.length === 0) return jobs;

  // Pre-compute sort keys for O(N) operations rather than parsing BigInts in O(N log N) comparisons
  const sortKeys = jobs.map((job) => ({
    job,
    postedMs: parseDateMs(job.date_posted),
    annualSortValueDesc: getAnnualSortValue(job, -1),
    annualSortValueAsc: getAnnualSortValue(job, Number.POSITIVE_INFINITY),
    match: matchData.get(job.id),
  }));

  sortKeys.sort((a, b) => {
    switch (sortBy) {
      case 'date-desc':
        return b.postedMs - a.postedMs;
      case 'date-asc':
        return a.postedMs - b.postedMs;
      case 'match-desc':
        return (b.match?.score ?? 0) - (a.match?.score ?? 0);
      case 'value-match-desc':
        return (b.match?.value_score ?? 0) - (a.match?.value_score ?? 0);
      case 'skill-match-desc':
        return (b.match?.skill_score ?? 0) - (a.match?.skill_score ?? 0);
      case 'salary-desc':
        return b.annualSortValueDesc - a.annualSortValueDesc;
      case 'salary-asc':
        return a.annualSortValueAsc - b.annualSortValueAsc;
      case 'org-asc':
        return a.job.organization.localeCompare(b.job.organization);
      default:
        return 0;
    }
  });

  return sortKeys.map((k) => k.job);
}
