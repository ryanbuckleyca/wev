import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useOrganizationData } from './useOrganizationData';
import type { OrganizationFilters } from './useOrganizationFilters';
import type { OrgIndexEntry } from '@/lib/organizations/types';

const emptyFilters: OrganizationFilters = {
  searchQuery: '',
  showNonSse: false,
  selectedProvinces: [],
  selectedMunicipalities: [],
  selectedTypes: [],
  selectedLanguages: [],
  selectedSectors: [],
  activityWindow: 'all',
};

const ssrOrg = {
  id: 'org-1',
  name: 'Anonymous SSR Org',
  slug: 'anonymous-ssr-org',
} as unknown as OrgIndexEntry;

describe('useOrganizationData', () => {
  beforeEach(() => {
    // Keep the personalized fetch pending so we can assert the discard state.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps anonymous SSR orgs when there is no session cookie', () => {
    const { result } = renderHook(() =>
      useOrganizationData(
        'en',
        {
          filters: emptyFilters,
          currentPage: 1,
          sortBy: 'org-asc',
          sessionCookie: false,
        },
        { orgs: [ssrOrg], total: 1 },
      ),
    );

    expect(result.current.orgs).toEqual([ssrOrg]);
    expect(result.current.total).toBe(1);
    expect(result.current.loading).toBe(false);
  });

  it('clears hydrated orgs and stays loading when a session cookie is present', () => {
    const { result } = renderHook(() =>
      useOrganizationData(
        'en',
        {
          filters: emptyFilters,
          currentPage: 1,
          sortBy: 'value-match-desc',
          sessionCookie: true,
        },
        { orgs: [ssrOrg], total: 1 },
      ),
    );

    expect(result.current.orgs).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.loading).toBe(true);
  });

  it('surfaces a timeout error and stops loading when the fetch aborts from timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }),
    );

    const { result, rerender } = renderHook(
      ({ sortBy }) =>
        useOrganizationData(
          'en',
          {
            filters: emptyFilters,
            currentPage: 1,
            sortBy,
            sessionCookie: false,
          },
          { orgs: [ssrOrg], total: 1 },
        ),
      { initialProps: { sortBy: 'org-asc' } },
    );

    // Trigger a client fetch (SSR completed key no longer matches).
    rerender({ sortBy: 'date-desc' });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(result.current.error).toBe('Request timed out');
    expect(result.current.loading).toBe(false);
  });
});
