import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { JobPosting } from '@/lib/supabase';
import { useUserJobMeta } from './useUserJobMeta';

const { mockFetchMatchMapForJobs, mockFetchBookmarkedJobIds } = vi.hoisted(() => ({
  mockFetchMatchMapForJobs: vi.fn(),
  mockFetchBookmarkedJobIds: vi.fn(),
}));

vi.mock('@/lib/bulletin/match-map', () => ({
  fetchMatchMapForJobs: mockFetchMatchMapForJobs,
}));

vi.mock('@/lib/bulletin/client-data', () => ({
  fetchBookmarkedJobIds: mockFetchBookmarkedJobIds,
}));

const baseJob: JobPosting = {
  id: 'job-1',
  job_title: 'Policy Analyst',
  organization: 'WEV',
  location: 'Ottawa, ON',
  municipality: 'Ottawa',
  province: 'ON',
  work_type: 'hybrid',
  date_posted: '2026-03-20T00:00:00.000Z',
  close_date: null,
  wage: '$20.00',
  listing_url: 'https://example.com/job-1',
};

describe('useUserJobMeta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes loading while user meta fetch is in-flight', async () => {
    let resolveMatches!: (value: Map<string, { score: number; shared_values: string[] }>) => void;
    let resolveBookmarks!: (value: Set<string>) => void;

    const matchesPromise = new Promise<Map<string, { score: number; shared_values: string[] }>>(
      (resolve) => {
        resolveMatches = resolve;
      },
    );
    const bookmarksPromise = new Promise<Set<string>>((resolve) => {
      resolveBookmarks = resolve;
    });

    mockFetchMatchMapForJobs.mockReturnValue(matchesPromise);
    mockFetchBookmarkedJobIds.mockReturnValue(bookmarksPromise);

    const { result } = renderHook(() => useUserJobMeta('user-1', [baseJob]));

    await waitFor(() => {
      expect(mockFetchMatchMapForJobs).toHaveBeenCalledWith('user-1', ['job-1']);
      expect(mockFetchBookmarkedJobIds).toHaveBeenCalledWith('user-1', ['job-1']);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    resolveMatches(new Map([['job-1', { score: 0.9, shared_values: [] }]]));
    resolveBookmarks(new Set(['job-1']));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.bookmarkedJobIds.has('job-1')).toBe(true);
      expect(result.current.matchData.get('job-1')?.score).toBe(0.9);
    });
  });

  it('uses hydrated server meta without triggering a client refetch', () => {
    mockFetchMatchMapForJobs.mockReset();
    mockFetchBookmarkedJobIds.mockReset();

    const initialData = {
      jobs: [baseJob],
      scrapeTime: null,
      total: 1,
      userId: 'user-1',
      matchData: {
        'job-1': {
          score: 0.75,
          shared_values: [],
        },
      },
      bookmarkedJobIds: ['job-1'],
      skillLabels: {},
      filterOptions: {
        organizations: [],
        provinces: [],
        municipalitiesByProvince: {},
        employmentTypes: [],
        sources: [],
        languages: [],
      },
    };

    const { result } = renderHook(() => useUserJobMeta('user-1', [baseJob], initialData));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.matchData.get('job-1')?.score).toBe(0.75);
    expect(result.current.bookmarkedJobIds.has('job-1')).toBe(true);
    expect(mockFetchMatchMapForJobs).not.toHaveBeenCalled();
    expect(mockFetchBookmarkedJobIds).not.toHaveBeenCalled();
  });

  it('stays idle when user is missing', () => {
    const { result } = renderHook(() => useUserJobMeta(null, [baseJob]));

    expect(result.current.isLoading).toBe(false);
    expect(mockFetchMatchMapForJobs).not.toHaveBeenCalled();
    expect(mockFetchBookmarkedJobIds).not.toHaveBeenCalled();
  });
});
