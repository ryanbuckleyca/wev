import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import enMessages from '@/messages/en.json';
import type { JobFiltersProps } from './types';
import { useJobFiltersModel } from './useJobFiltersModel';

function createProps(): JobFiltersProps {
  return {
    jobs: [
      {
        id: 'job-1',
        job_title: 'Policy Analyst',
        organization: 'Org One',
        location: 'Toronto, ON',
        municipality: 'Toronto',
        province: 'Ontario',
        work_type: 'remote',
        date_posted: '2026-03-01T00:00:00.000Z',
        close_date: null,
        wage: '$80,000',
        listing_url: 'https://example.com/job-1',
        employment_type: 'Full-time',
        source: 'Source One',
        is_sse: true,
      },
      {
        id: 'job-2',
        job_title: 'Planner',
        organization: 'Org Two',
        location: 'Halifax, NS',
        municipality: 'Halifax',
        province: 'Nova Scotia',
        work_type: 'hybrid',
        date_posted: '2026-03-02T00:00:00.000Z',
        close_date: null,
        wage: null,
        listing_url: 'https://example.com/job-2',
        employment_type: 'Contract',
        source: 'Source Two',
        is_sse: false,
      },
    ],
    filteredJobsCount: 1,
    totalJobsCount: 2,
    searchQuery: 'climate policy',
    onSearchChange: vi.fn(),
    selectedOrganizations: ['Org One'],
    onOrganizationsChange: vi.fn(),
    selectedProvinces: ['Ontario'],
    onProvincesChange: vi.fn(),
    selectedMunicipalities: ['Toronto'],
    onMunicipalitiesChange: vi.fn(),
    selectedEmploymentTypes: ['Full-time'],
    onEmploymentTypesChange: vi.fn(),
    selectedSources: ['Source One'],
    onSourcesChange: vi.fn(),
    selectedWorkTypes: ['remote'],
    onWorkTypesChange: vi.fn(),
    showOnlySse: true,
    onShowOnlySseChange: vi.fn(),
    showJobsWithoutSalary: false,
    onShowJobsWithoutSalaryChange: vi.fn(),
    postedWithin: '1-week',
    onPostedWithinChange: vi.fn(),
    filtersExpanded: false,
    onFiltersExpandedChange: vi.fn(),
    profileWorkTypes: ['remote', 'hybrid'],
    isUsingProfileWorkTypes: false,
    onResetToProfileWorkTypes: vi.fn(),
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe('useJobFiltersModel', () => {
  it('builds active filter chips with working remove handlers', () => {
    const props = createProps();
    const { result } = renderHook(() => useJobFiltersModel(props), {
      wrapper: Wrapper,
    });

    expect(result.current.filteredJobsCountResolved).toBe(1);
    expect(result.current.totalJobsCountResolved).toBe(2);
    expect(result.current.hasAnyFilters).toBe(true);
    expect(result.current.activeFilterChips.map((chip) => chip.id)).toEqual([
      'posted-within',
      'sse',
      'salary',
      'search',
      'work-types',
      'province-Ontario',
      'municipality-Toronto',
      'organization-Org One',
      'employment-type-Full-time',
      'source-Source One',
    ]);

    act(() => {
      result.current.activeFilterChips.find((chip) => chip.id === 'posted-within')?.onRemove?.();
      result.current.activeFilterChips.find((chip) => chip.id === 'search')?.onRemove?.();
      result.current.activeFilterChips.find((chip) => chip.id === 'province-Ontario')?.onRemove?.();
    });

    expect(props.onPostedWithinChange).toHaveBeenCalledWith('any');
    expect(props.onSearchChange).toHaveBeenCalledWith('');
    expect(props.onProvincesChange).toHaveBeenCalledWith([]);
  });

  it('applies suggested defaults and clears back to the show-all state', () => {
    const props = createProps();
    const { result } = renderHook(() => useJobFiltersModel(props), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.applySuggestedDefaults();
    });

    expect(props.onSearchChange).toHaveBeenCalledWith('');
    expect(props.onOrganizationsChange).toHaveBeenCalledWith([]);
    expect(props.onProvincesChange).toHaveBeenCalledWith([]);
    expect(props.onMunicipalitiesChange).toHaveBeenCalledWith([]);
    expect(props.onEmploymentTypesChange).toHaveBeenCalledWith([]);
    expect(props.onSourcesChange).toHaveBeenCalledWith([]);
    expect(props.onWorkTypesChange).toHaveBeenCalledWith(['remote', 'hybrid']);
    expect(props.onShowOnlySseChange).toHaveBeenCalledWith(true);
    expect(props.onShowJobsWithoutSalaryChange).toHaveBeenCalledWith(true);
    expect(props.onPostedWithinChange).toHaveBeenCalledWith('2-weeks');

    act(() => {
      result.current.clearAllFilters();
    });

    expect(props.onShowOnlySseChange).toHaveBeenCalledWith(false);
    expect(props.onWorkTypesChange).toHaveBeenCalledWith([]);
    expect(props.onPostedWithinChange).toHaveBeenCalledWith('any');
  });
});
