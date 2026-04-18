import {
  JOB_SORT_OPTIONS,
  POSTED_WITHIN_FILTER_OPTIONS,
  type BulletinFilters,
  type JobSortOption,
} from '@/lib/bulletin/job-query';
import type { Profile } from '@/lib/supabase/profiles';
import { normalizeWorkTypes } from '@/lib/work-types';

export type SearchParamValue = string | string[] | undefined;
export type BulletinSearchParams = Record<string, SearchParamValue>;

export interface ParsedBulletinRequest {
  currentPage: number;
  filters: BulletinFilters;
  sortBy: JobSortOption;
}

function getFirstValue(value: SearchParamValue): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function getStringArray(value: SearchParamValue, defaultValue: string[]): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => Boolean(item));
  }
  if (typeof value === 'string' && value.length > 0) {
    return [value];
  }
  return defaultValue;
}

function getBooleanValue(value: SearchParamValue, defaultValue: boolean): boolean {
  const raw = getFirstValue(value);
  if (!raw) return defaultValue;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return defaultValue;
}

function getPositiveIntValue(value: SearchParamValue, defaultValue: number): number {
  const raw = getFirstValue(value);
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function getLiteralValue<T extends readonly string[]>(
  value: SearchParamValue,
  validValues: T,
  defaultValue: T[number],
): T[number] {
  const raw = getFirstValue(value);
  return raw && validValues.includes(raw as T[number]) ? (raw as T[number]) : defaultValue;
}

export function parseBulletinRequest(
  searchParams: BulletinSearchParams,
  profile: Profile | null,
  userId: string | null,
): ParsedBulletinRequest {
  const defaultWorkTypes = userId ? normalizeWorkTypes(profile?.work_types) : [];
  const defaultProvinces = userId && profile?.province ? [profile.province] : [];
  const defaultMunicipalities = userId && profile?.municipality ? [profile.municipality] : [];

  return {
    currentPage: getPositiveIntValue(searchParams.page, 1),
    sortBy: getLiteralValue(searchParams.sort, JOB_SORT_OPTIONS, 'date-desc'),
    filters: {
      searchQuery: getFirstValue(searchParams.q) ?? '',
      selectedOrganizations: getStringArray(searchParams.org, []),
      selectedProvinces: getStringArray(searchParams.province, defaultProvinces),
      selectedMunicipalities: getStringArray(searchParams.municipality, defaultMunicipalities),
      selectedEmploymentTypes: getStringArray(searchParams.employment, []),
      selectedSources: getStringArray(searchParams.source, []),
      selectedWorkTypes: getStringArray(searchParams.workType, defaultWorkTypes),
      showOnlySse: getBooleanValue(searchParams.sse, true),
      showJobsWithoutSalary: getBooleanValue(searchParams.salary, true),
      postedWithin: getLiteralValue(searchParams.posted, POSTED_WITHIN_FILTER_OPTIONS, '2-weeks'),
    },
  };
}

function toSearchParamValueArray(values: string[]): SearchParamValue {
  if (values.length === 0) return undefined;
  if (values.length === 1) return values[0];
  return values;
}

export function toBulletinSearchParams(searchParams: URLSearchParams): BulletinSearchParams {
  return {
    q: toSearchParamValueArray(searchParams.getAll('q')),
    org: toSearchParamValueArray(searchParams.getAll('org')),
    province: toSearchParamValueArray(searchParams.getAll('province')),
    municipality: toSearchParamValueArray(searchParams.getAll('municipality')),
    employment: toSearchParamValueArray(searchParams.getAll('employment')),
    source: toSearchParamValueArray(searchParams.getAll('source')),
    workType: toSearchParamValueArray(searchParams.getAll('workType')),
    sse: toSearchParamValueArray(searchParams.getAll('sse')),
    salary: toSearchParamValueArray(searchParams.getAll('salary')),
    posted: toSearchParamValueArray(searchParams.getAll('posted')),
    sort: toSearchParamValueArray(searchParams.getAll('sort')),
    page: toSearchParamValueArray(searchParams.getAll('page')),
  };
}

export function parseBulletinRequestFromUrlSearchParams(
  searchParams: URLSearchParams,
): ParsedBulletinRequest {
  return parseBulletinRequest(toBulletinSearchParams(searchParams), null, null);
}
