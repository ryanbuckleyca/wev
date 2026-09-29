import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBulletinFetch } from './useBulletinFetch';
import type { BulletinFilters } from '@/lib/bulletin/job-query';
import type { InitialBulletinData } from '@/lib/bulletin/types';
import type { JobPosting } from '@/lib/supabase';

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => ({ has: () => false })),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const emptyFilters: BulletinFilters = {
  searchQuery: '',
  selectedOrganizations: [],
  selectedOrgTypes: [],
  selectedSectors: [],
  selectedProvinces: [],
  selectedMunicipalities: [],
  selectedEmploymentTypes: [],
  selectedSources: [],
  selectedWorkTypes: [],
  selectedLanguages: [],
  showNonSse: false,
  showJobsWithoutSalary: false,
  postedWithin: '2-weeks',
};

const ssrJob = {
  id: 'job-1',
  job_title: 'Anonymous SSR Job',
  organization: 'Org',
} as unknown as JobPosting;

const initialData: InitialBulletinData = {
  jobs: [ssrJob],
  scrapeTime: null,
  total: 1,
  totalAvailable: 1,
  filterOptions: {
    organizations: [],
    provinces: [],
    municipalitiesByProvince: {},
    employmentTypes: [],
    sources: [],
    languages: [],
  },
};

const baseOptions = {
  filters: emptyFilters,
  hasAnyFilters: false,
  sortBy: 'date-desc' as const,
  currentPage: 1,
  setCurrentPage: vi.fn(),
  filtersReady: false,
};

describe('useBulletinFetch', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps anonymous SSR jobs visible while filtersReady is false and cookie is unread', () => {
    const { result } = renderHook(() =>
      useBulletinFetch('en', { ...baseOptions, sessionCookie: null }, initialData),
    );

    expect(result.current.jobsOnPage).toEqual([ssrJob]);
    expect(result.current.loading).toBe(false);
  });

  it('keeps anonymous SSR jobs visible when there is no session cookie', () => {
    const { result } = renderHook(() =>
      useBulletinFetch('en', { ...baseOptions, sessionCookie: false }, initialData),
    );

    expect(result.current.jobsOnPage).toEqual([ssrJob]);
    expect(result.current.loading).toBe(false);
  });

  it('clears hydrated jobs and stays loading when a session cookie is present', () => {
    const { result } = renderHook(() =>
      useBulletinFetch('en', { ...baseOptions, sessionCookie: true }, initialData),
    );

    expect(result.current.jobsOnPage).toEqual([]);
    expect(result.current.loading).toBe(true);
  });
});
