import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import enMessages from '@/messages/en.json';
import { useBulletinFetch } from './useBulletinFetch';
import type { InitialBulletinData } from '@/lib/bulletin/types';
import type { JobPosting } from '@/lib/supabase';
import type { BulletinFilters } from '@/lib/bulletin/job-query';

const TEST_JOB: JobPosting = {
  id: 'job-1',
  job_title: 'Policy Analyst',
  organization: 'Org One',
  location: 'Toronto, ON',
  municipality: 'Toronto',
  province: 'Ontario',
  work_type: 'hybrid',
  date_posted: '2026-03-01T00:00:00.000Z',
  close_date: null,
  wage: '$80,000',
  listing_url: 'https://example.com/job-1',
  is_sse: true,
};

function IntlWrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

const DEFAULT_FILTERS: BulletinFilters = {
  searchQuery: '',
  selectedOrganizations: [],
  selectedProvinces: [],
  selectedMunicipalities: [],
  selectedEmploymentTypes: [],
  selectedSources: [],
  selectedWorkTypes: [],
  showOnlySse: true,
  showJobsWithoutSalary: true,
  postedWithin: '2-weeks',
};

describe('useBulletinFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches bulletin data when there is no initial page payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobs: [TEST_JOB],
        lastScrapeTime: null,
        skillLabels: {},
        filteredJobsCount: 1,
        totalJobsCount: 1,
        totalPages: 1,
        currentPage: 1,
        filterOptions: {
          organizations: ['Org One'],
          provinces: ['Ontario'],
          municipalitiesByProvince: { Ontario: ['Toronto'] },
          employmentTypes: ['full-time'],
          sources: ['Org One'],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () =>
        useBulletinFetch('en', {
          filters: DEFAULT_FILTERS,
          sortBy: 'date-desc',
          currentPage: 1,
        }),
      { wrapper: IntlWrapper },
    );

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bulletin?locale=en&page=1&sort=date-desc&sse=true&salary=true&posted=2-weeks',
        expect.objectContaining({
          cache: 'no-cache',
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.allJobs).toEqual([TEST_JOB]);
    expect(result.current.filteredJobsCount).toBe(1);
    expect(result.current.totalJobsCount).toBe(1);
    expect(result.current.totalPages).toBe(1);
  });

  it('skips the client fetch when the server already supplied jobs', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const initialData: InitialBulletinData = {
      jobs: [TEST_JOB],
      scrapeTime: null,
      skillLabels: {},
    };

    const { result } = renderHook(
      () =>
        useBulletinFetch(
          'en',
          {
            filters: DEFAULT_FILTERS,
            sortBy: 'date-desc',
            currentPage: 1,
          },
          initialData,
        ),
      { wrapper: IntlWrapper },
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.allJobs).toEqual([TEST_JOB]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-fetches when request state changes (e.g. pagination)', async () => {
    const SECOND_JOB: JobPosting = {
      ...TEST_JOB,
      id: 'job-2',
      job_title: 'Program Coordinator',
      listing_url: 'https://example.com/job-2',
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobs: [SECOND_JOB],
        lastScrapeTime: null,
        skillLabels: {},
        filteredJobsCount: 2,
        totalJobsCount: 2,
        totalPages: 2,
        currentPage: 2,
        filterOptions: {
          organizations: ['Org One'],
          provinces: ['Ontario'],
          municipalitiesByProvince: { Ontario: ['Toronto'] },
          employmentTypes: ['full-time'],
          sources: ['Org One'],
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const initialData: InitialBulletinData = {
      jobs: [TEST_JOB],
      scrapeTime: null,
      skillLabels: {},
      filteredJobsCount: 2,
      totalJobsCount: 2,
      totalPages: 2,
    };

    const { result, rerender } = renderHook(
      ({ page }) =>
        useBulletinFetch(
          'en',
          {
            filters: DEFAULT_FILTERS,
            sortBy: 'date-desc',
            currentPage: page,
          },
          initialData,
        ),
      {
        wrapper: IntlWrapper,
        initialProps: { page: 1 },
      },
    );

    expect(fetchMock).not.toHaveBeenCalled();

    rerender({ page: 2 });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bulletin?locale=en&page=2&sort=date-desc&sse=true&salary=true&posted=2-weeks',
        expect.objectContaining({
          cache: 'no-cache',
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.allJobs).toEqual([SECOND_JOB]);
  });
});
