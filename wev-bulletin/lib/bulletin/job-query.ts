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

function getAnnualSortValue(job: JobPosting, missingValue: number): number {
  if (job.min_value != null && job.unit_text != null) {
    const annual = toAnnual(BigInt(job.min_value), job.unit_text, job.hours_per_week);
    return annual != null ? Number(annual) : missingValue;
  }
  return missingValue;
}

/** @param lowerQuery – must already be lowercased by the caller. */
function matchesSearch(job: JobPosting, lowerQuery: string): boolean {
  if (!lowerQuery) return true;
  return Boolean(
    job.job_title.toLowerCase().includes(lowerQuery) ||
    (job.summary && job.summary.toLowerCase().includes(lowerQuery)) ||
    job.organization.toLowerCase().includes(lowerQuery) ||
    (job.location && job.location.toLowerCase().includes(lowerQuery)) ||
    (job.municipality && job.municipality.toLowerCase().includes(lowerQuery)) ||
    (job.province && job.province.toLowerCase().includes(lowerQuery)),
  );
}

function matchesSelection<T>(value: T | null | undefined, selectedValues: T[]): boolean {
  if (selectedValues.length === 0) return true;
  if (value == null) return false;
  return selectedValues.includes(value);
}

export function filterJobs(jobs: JobPosting[], filters: BulletinFilters): JobPosting[] {
  const lowerQuery = filters.searchQuery ? filters.searchQuery.trim().toLowerCase() : '';
  const cutoffMs =
    filters.postedWithin !== 'any'
      ? (filters.now ?? Date.now()) - POSTED_WITHIN_DAYS[filters.postedWithin] * 86_400_000
      : null;

  const explicitlySeekingRemote = filters.selectedWorkTypes.includes('remote');

  return jobs.filter((job) => {
    if (!matchesSearch(job, lowerQuery)) return false;

    if (!matchesSelection(job.organization, filters.selectedOrganizations)) return false;
    if (!matchesSelection(job.work_type, filters.selectedWorkTypes)) return false;
    if (!matchesSelection(job.language, filters.selectedLanguages)) return false;
    if (!matchesSelection(job.employment_type, filters.selectedEmploymentTypes)) return false;
    if (!matchesSelection(job.source, filters.selectedSources)) return false;

    if (filters.showOnlySse && !job.is_sse) return false;
    if (!filters.showJobsWithoutSalary && !job.wage?.trim() && job.min_value == null) return false;

    if (cutoffMs != null) {
      const postedMs = parseDateMs(job.date_posted);
      if (Number.isNaN(postedMs) || postedMs < cutoffMs) return false;
    }

    const bypassLocation = explicitlySeekingRemote && job.work_type === 'remote';

    if (!bypassLocation && !matchesSelection(job.province, filters.selectedProvinces)) return false;
    if (!bypassLocation && !matchesSelection(job.municipality, filters.selectedMunicipalities))
      return false;

    return true;
  });
}

export function sortJobs(
  jobs: JobPosting[],
  sortBy: JobSortOption,
  matchData: Map<string, JobMatchData>,
): JobPosting[] {
  if (jobs.length === 0) return jobs;

  const needsDate = sortBy === 'date-desc' || sortBy === 'date-asc';
  const needsSalary = sortBy === 'salary-desc' || sortBy === 'salary-asc';
  const salaryFallback = sortBy === 'salary-asc' ? Number.POSITIVE_INFINITY : -1;

  // Pre-compute sort keys so expensive work (BigInt, Map lookup, date parsing)
  // happens in O(N) rather than O(N log N) comparisons.
  const sortKeys = jobs.map((job) => ({
    job,
    postedMs: needsDate ? parseDateMs(job.date_posted) : 0,
    annualSortValue: needsSalary ? getAnnualSortValue(job, salaryFallback) : 0,
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
        return b.annualSortValue - a.annualSortValue;
      case 'salary-asc':
        return a.annualSortValue - b.annualSortValue;
      case 'org-asc':
        return a.job.organization.localeCompare(b.job.organization);
      default:
        return 0;
    }
  });

  return sortKeys.map((k) => k.job);
}
