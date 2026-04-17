import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import enMessages from '@/messages/en.json';
import { useBulletinFetch } from './useBulletinFetch';
import type { InitialBulletinData } from '@/lib/bulletin/types';
import type { JobPosting } from '@/lib/supabase';

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

describe('useBulletinFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches bulletin data when initialData only contains user metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobs: [TEST_JOB],
        lastScrapeTime: null,
        skillLabels: {},
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const initialData: InitialBulletinData = {
      userId: 'user-1',
    };

    const { result } = renderHook(() => useBulletinFetch('en', initialData), {
      wrapper: IntlWrapper,
    });

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bulletin?locale=en',
        expect.objectContaining({
          cache: 'no-cache',
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.allJobs).toEqual([TEST_JOB]);
  });

  it('skips the client fetch when the server already supplied jobs', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const initialData: InitialBulletinData = {
      jobs: [TEST_JOB],
      scrapeTime: null,
      skillLabels: {},
    };

    const { result } = renderHook(() => useBulletinFetch('en', initialData), {
      wrapper: IntlWrapper,
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.allJobs).toEqual([TEST_JOB]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hydrates the full dataset in the background when the server only supplied a page slice', async () => {
    const SECOND_JOB: JobPosting = {
      ...TEST_JOB,
      id: 'job-2',
      job_title: 'Program Coordinator',
      listing_url: 'https://example.com/job-2',
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobs: [TEST_JOB, SECOND_JOB],
        lastScrapeTime: null,
        skillLabels: {},
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const initialData: InitialBulletinData = {
      jobs: [TEST_JOB],
      scrapeTime: null,
      skillLabels: {},
      isPartialHydration: true,
      filteredJobsCount: 42,
      totalJobsCount: 84,
      totalPages: 3,
    };

    const { result } = renderHook(() => useBulletinFetch('en', initialData), {
      wrapper: IntlWrapper,
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.hasHydratedFullDataset).toBe(false);
    expect(result.current.allJobs).toEqual([TEST_JOB]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bulletin?locale=en',
        expect.objectContaining({
          cache: 'no-cache',
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.hasHydratedFullDataset).toBe(true);
    });

    expect(result.current.allJobs).toEqual([TEST_JOB, SECOND_JOB]);
  });
});
