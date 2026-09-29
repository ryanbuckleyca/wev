import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
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
});
