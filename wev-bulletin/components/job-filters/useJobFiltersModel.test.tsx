import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { JobPosting } from '@/lib/supabase';
import type { WorkType } from '@/lib/work-types';
import enMessages from '@/messages/en.json';
import type { JobFiltersProps } from './types';
import { useJobFiltersModel } from './useJobFiltersModel';

const mockControls = {
  searchQuery: 'climate policy',
  setSearchQuery: vi.fn(),
  selectedOrganizations: ['Org One'],
  setSelectedOrganizations: vi.fn(),
  selectedProvinces: ['Ontario'],
  setSelectedProvinces: vi.fn(),
  selectedMunicipalities: ['Toronto'],
  setSelectedMunicipalities: vi.fn(),
  selectedEmploymentTypes: ['Full-time'],
  setSelectedEmploymentTypes: vi.fn(),
  selectedSources: ['Source One'],
  setSelectedSources: vi.fn(),
  selectedWorkTypes: ['remote'],
  setSelectedWorkTypes: vi.fn(),
  showOnlySse: true,
  setShowOnlySse: vi.fn(),
  showJobsWithoutSalary: false,
  setShowJobsWithoutSalary: vi.fn(),
  postedWithin: '1-week',
  setPostedWithin: vi.fn(),
  filtersExpanded: false,
  setFiltersExpanded: vi.fn(),
  profileWorkTypes: ['remote', 'hybrid'] as WorkType[],
  isUsingProfileWorkTypes: false,
  handleResetToProfileWorkTypes: vi.fn(),
  profileMunicipality: null as string | null,
  profileProvince: null as string | null,
  isUsingProfileLocation: false,
  handleResetToProfileLocation: vi.fn(),
};

vi.mock('@/contexts/BulletinFilterContext', () => ({
  useBulletinFilterContext: () => mockControls,
}));

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
        summary: '',
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
        summary: '',
      },
    ] as JobPosting[],
    filteredJobsCount: 1,
    totalJobsCount: 2,
    filterOptions: {
      organizations: ['Org One', 'Org Two'],
      provinces: ['Ontario', 'Nova Scotia'],
      municipalitiesByProvince: {
        Ontario: ['Toronto'],
        'Nova Scotia': ['Halifax'],
      },
      employmentTypes: ['Full-time', 'Contract'],
      sources: ['Source One', 'Source Two'],
    },
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds active filter chips with working remove handlers', () => {
    const props = createProps();
    const { result } = renderHook(() => useJobFiltersModel(props), {
      wrapper: Wrapper,
    });

    expect(result.current.filteredJobsCountResolved).toBe(1);
    expect(result.current.totalJobsCountResolved).toBe(2);
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

    expect(mockControls.setPostedWithin).toHaveBeenCalledWith('any');
    expect(mockControls.setSearchQuery).toHaveBeenCalledWith('');
    expect(mockControls.setSelectedProvinces).toHaveBeenCalledWith([]);
  });
});
