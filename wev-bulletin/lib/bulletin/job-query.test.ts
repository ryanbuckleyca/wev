import { describe, it, expect } from 'vitest';
import { filterJobs, sortJobs, type BulletinFilters, type JobSortOption } from './job-query';
import type { JobPosting, JobMatchData } from '@/lib/supabase';

describe('job-query', () => {
  const mockJobs: JobPosting[] = [
    {
      id: '1',
      job_title: 'Software Engineer',
      organization: 'Tech Corp',
      summary: 'Exciting role',
      location: 'Paris',
      municipality: 'Paris',
      province: 'Île-de-France',
      work_type: 'remote',
      is_sse: true,
      date_posted: '2024-01-10',
      min_value: 50000,
      unit_text: 'YEAR',
      employment_type: 'full-time',
      source: 'Indeed',
    },
    {
      id: '2',
      job_title: 'Product Manager',
      organization: 'Product Inc',
      summary: 'Lead products',
      location: 'Lyon',
      municipality: 'Lyon',
      province: 'Auvergne-Rhône-Alpes',
      work_type: 'office',
      is_sse: false,
      date_posted: '2024-01-01',
      min_value: null,
      wage: '',
      employment_type: 'part-time',
      source: 'LinkedIn',
    },
  ] as any;

  const defaultFilters: BulletinFilters = {
    searchQuery: '',
    selectedOrganizations: [],
    selectedProvinces: [],
    selectedMunicipalities: [],
    selectedEmploymentTypes: [],
    selectedSources: [],
    selectedWorkTypes: [],
    selectedLanguages: [],
    showNonSse: true,   // true = show all jobs (for most filter tests we want both jobs visible)
    showJobsWithoutSalary: true,
    postedWithin: 'any',
    now: new Date('2024-01-15').getTime(),
  };

  describe('filterJobs', () => {
    it('returns all jobs by default', () => {
      expect(filterJobs(mockJobs, defaultFilters)).toHaveLength(2);
    });

    it('filters by searchQuery', () => {
      expect(filterJobs(mockJobs, { ...defaultFilters, searchQuery: 'Software' })).toHaveLength(1);
      expect(filterJobs(mockJobs, { ...defaultFilters, searchQuery: 'Paris' })).toHaveLength(1);
      expect(filterJobs(mockJobs, { ...defaultFilters, searchQuery: 'Lyon' })).toHaveLength(1);
      expect(filterJobs(mockJobs, { ...defaultFilters, searchQuery: ' Paris ' })).toHaveLength(1);
      expect(filterJobs(mockJobs, { ...defaultFilters, searchQuery: '   ' })).toHaveLength(2);
    });

    it('filters by organization', () => {
      expect(
        filterJobs(mockJobs, { ...defaultFilters, selectedOrganizations: ['Tech Corp'] }),
      ).toHaveLength(1);
    });

    it('filters by work type', () => {
      expect(
        filterJobs(mockJobs, { ...defaultFilters, selectedWorkTypes: ['remote'] }),
      ).toHaveLength(1);
    });

    it('filters by SSE', () => {
      // showNonSse=false → SSE-only (the default view); showNonSse=true → show all
      expect(filterJobs(mockJobs, { ...defaultFilters, showNonSse: false })).toHaveLength(1);
      expect(filterJobs(mockJobs, { ...defaultFilters, showNonSse: true })).toHaveLength(2);
    });

    it('filters by salary presence', () => {
      expect(
        filterJobs(mockJobs, { ...defaultFilters, showJobsWithoutSalary: false }),
      ).toHaveLength(1);
    });

    it('filters by posted within', () => {
      expect(filterJobs(mockJobs, { ...defaultFilters, postedWithin: '1-week' })).toHaveLength(1);
      expect(filterJobs(mockJobs, { ...defaultFilters, postedWithin: '1-month' })).toHaveLength(2);
    });

    it('filters by province and municipality strictly by default', () => {
      expect(
        filterJobs(mockJobs, { ...defaultFilters, selectedProvinces: ['Île-de-France'] }),
      ).toHaveLength(1); // Job 1 is in Île-de-France

      expect(
        filterJobs(mockJobs, { ...defaultFilters, selectedMunicipalities: ['Lyon'] }),
      ).toHaveLength(1); // Job 2 is in Lyon. Job 1 is remote but work_type 'remote' is not explicitly selected, so it does not bypass.
    });

    it('allows remote jobs to bypass province filter when remote is explicitly selected', () => {
      const result = filterJobs(mockJobs, {
        ...defaultFilters,
        selectedProvinces: ['Auvergne-Rhône-Alpes'],
        selectedWorkTypes: ['remote', 'office'],
      });
      expect(result.map((j) => j.id)).toEqual(expect.arrayContaining(['1', '2']));
      expect(result).toHaveLength(2);
    });

    it('allows remote jobs to bypass municipality filter when remote is explicitly selected', () => {
      const result = filterJobs(mockJobs, {
        ...defaultFilters,
        selectedMunicipalities: ['Lyon'],
        selectedWorkTypes: ['remote', 'office'],
      });
      expect(result.map((j) => j.id)).toEqual(expect.arrayContaining(['1', '2']));
      expect(result).toHaveLength(2);
    });

    it('does not bypass geographic filters when only non-remote work types are selected', () => {
      const result = filterJobs(mockJobs, {
        ...defaultFilters,
        selectedProvinces: ['Auvergne-Rhône-Alpes'],
        selectedWorkTypes: ['office'],
      });
      expect(result.map((j) => j.id)).toEqual(['2']);
    });

    it('does not bypass geographic filters for hybrid jobs even when remote is selected', () => {
      const hybridJob = {
        ...mockJobs[0],
        id: '3',
        work_type: 'hybrid' as const,
        province: 'Normandie',
        municipality: 'Rouen',
      };
      const result = filterJobs([...mockJobs, hybridJob] as any, {
        ...defaultFilters,
        selectedProvinces: ['Auvergne-Rhône-Alpes'],
        selectedWorkTypes: ['remote', 'hybrid', 'office'],
      });
      // Job 1 (remote) bypasses, Job 2 (office, matching province) passes, Job 3 (hybrid, wrong province) excluded
      expect(result.map((j) => j.id)).toEqual(expect.arrayContaining(['1', '2']));
      expect(result).toHaveLength(2);
    });

    it('bypass is a no-op when no geographic filters are active', () => {
      const result = filterJobs(mockJobs, {
        ...defaultFilters,
        selectedWorkTypes: ['remote'],
      });
      expect(result.map((j) => j.id)).toEqual(['1']);
    });

    it('remote job with null province still bypasses when remote is selected', () => {
      const remoteNoProvince = {
        ...mockJobs[0],
        id: '4',
        province: null,
        municipality: null,
      };
      const result = filterJobs([mockJobs[1], remoteNoProvince] as any, {
        ...defaultFilters,
        selectedProvinces: ['Auvergne-Rhône-Alpes'],
        selectedWorkTypes: ['remote', 'office'],
      });
      expect(result.map((j) => j.id)).toEqual(expect.arrayContaining(['2', '4']));
      expect(result).toHaveLength(2);
    });

    it('filters by employment type and source', () => {
      expect(
        filterJobs(mockJobs, { ...defaultFilters, selectedEmploymentTypes: ['full-time'] }),
      ).toHaveLength(1);
      expect(
        filterJobs(mockJobs, { ...defaultFilters, selectedSources: ['LinkedIn'] }),
      ).toHaveLength(1);
    });
  });

  describe('sortJobs', () => {
    const matchData = new Map<string, JobMatchData>([
      ['1', { score: 0.8, value_score: 0.9, skill_score: 0.7 } as any],
      ['2', { score: 0.5, value_score: 0.4, skill_score: 0.6 } as any],
    ]);

    it('sorts by date', () => {
      const sorted = sortJobs(mockJobs, 'date-desc', matchData);
      expect(sorted[0].id).toBe('1');
      const sortedAsc = sortJobs(mockJobs, 'date-asc', matchData);
      expect(sortedAsc[0].id).toBe('2');
    });

    it('sorts by match scores', () => {
      expect(sortJobs(mockJobs, 'match-desc', matchData)[0].id).toBe('1');
      expect(sortJobs(mockJobs, 'value-match-desc', matchData)[0].id).toBe('1');
      expect(sortJobs(mockJobs, 'skill-match-desc', matchData)[0].id).toBe('1');
    });

    it('sorts by salary', () => {
      expect(sortJobs(mockJobs, 'salary-desc', matchData)[0].id).toBe('1');
      expect(sortJobs(mockJobs, 'salary-asc', matchData)[0].id).toBe('1');
    });

    it('sorts by organization', () => {
      expect(sortJobs(mockJobs, 'org-asc', matchData)[0].organization).toBe('Product Inc');
      expect(sortJobs(mockJobs, 'org-desc', matchData)[0].organization).toBe('Tech Corp');
    });

    it('handles default case', () => {
      expect(sortJobs(mockJobs, 'invalid' as any, matchData)).toHaveLength(2);
    });

    it('returns empty array as-is', () => {
      expect(sortJobs([], 'date-desc', matchData)).toEqual([]);
    });
  });
});
