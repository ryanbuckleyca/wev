import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOrganizationPagination } from './useOrganizationPagination';
import type { OrganizationFilters } from './useOrganizationFilters';

const baseFilters: OrganizationFilters = {
  searchQuery: '',
  showNonSse: false,
  selectedProvinces: [],
  selectedMunicipalities: [],
  selectedTypes: [],
  selectedLanguages: [],
  selectedSectors: [],
  activityWindow: 'all',
};

describe('useOrganizationPagination', () => {
  it('resets to page 1 when filters change', () => {
    const setCurrentPage = vi.fn();
    // 300 orgs → 15 pages, so page 15 is in range (clamp must not fire on mount).
    const { rerender } = renderHook(
      ({ filters, currentPage }) =>
        useOrganizationPagination(300, {
          filters,
          sortBy: 'org-asc',
          currentPage,
          setCurrentPage,
        }),
      {
        initialProps: { filters: baseFilters, currentPage: 15 },
      },
    );

    expect(setCurrentPage).not.toHaveBeenCalled();

    rerender({
      filters: { ...baseFilters, searchQuery: 'baby ghosts' },
      currentPage: 15,
    });

    expect(setCurrentPage).toHaveBeenCalledWith(1);
  });

  it('prefers page 1 over clamping when a filter change shrinks the result set', () => {
    const setCurrentPage = vi.fn();
    // 300 orgs → 15 pages (page 15 in range). After filtering: 60 orgs → 3 pages.
    const { rerender } = renderHook(
      ({ totalOrgs, filters, currentPage }) =>
        useOrganizationPagination(totalOrgs, {
          filters,
          sortBy: 'org-asc',
          currentPage,
          setCurrentPage,
        }),
      {
        initialProps: {
          totalOrgs: 300,
          filters: baseFilters,
          currentPage: 15,
        },
      },
    );

    expect(setCurrentPage).not.toHaveBeenCalled();

    rerender({
      totalOrgs: 60,
      filters: { ...baseFilters, searchQuery: 'baby ghosts' },
      currentPage: 15,
    });

    // Filter reset wins: page 1, never clamped to the last filtered page (3).
    expect(setCurrentPage).toHaveBeenCalledWith(1);
    expect(setCurrentPage).not.toHaveBeenCalledWith(3);
  });

  it('clamps page when it is past the last page', () => {
    const setCurrentPage = vi.fn();
    renderHook(() =>
      useOrganizationPagination(1, {
        filters: { ...baseFilters, searchQuery: 'baby ghosts' },
        sortBy: 'org-asc',
        currentPage: 15,
        setCurrentPage,
      }),
    );

    expect(setCurrentPage).toHaveBeenCalledWith(1);
  });
});
