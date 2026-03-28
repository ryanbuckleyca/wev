import { describe, expect, it } from 'vitest';
import type { JobPosting } from '@/lib/supabase';
import { filterJobs, sortJobs, type BulletinFilters } from './job-query';

function makeJob(overrides: Partial<JobPosting>): JobPosting {
  return {
    id: 'job-1',
    job_title: 'Community Organizer',
    organization: 'WEV',
    location: 'Ottawa, ON',
    municipality: 'Ottawa',
    province: 'Ontario',
    work_type: 'hybrid',
    date_posted: '2026-03-20T00:00:00',
    close_date: null,
    wage: '$25.00',
    listing_url: 'https://example.com/job',
    employment_type: 'Full-time',
    summary: 'Build community power.',
    is_sse: true,
    source: 'GoodWork',
    ...overrides,
  };
}

function makeFilters(overrides: Partial<BulletinFilters> = {}): BulletinFilters {
  return {
    searchQuery: '',
    selectedOrganizations: [],
    selectedProvinces: [],
    selectedMunicipalities: [],
    selectedEmploymentTypes: [],
    selectedSources: [],
    selectedWorkTypes: [],
    showOnlySse: false,
    showJobsWithoutSalary: true,
    postedWithin: 'any',
    ...overrides,
  };
}

describe('job query helpers', () => {
  it('filters jobs by search, source, SSE, and posted date', () => {
    const jobs = [
      makeJob({ id: 'recent-match' }),
      makeJob({
        id: 'wrong-source',
        source: 'CharityVillage',
      }),
      makeJob({
        id: 'old-match',
        date_posted: '2026-02-01T00:00:00',
      }),
      makeJob({
        id: 'non-sse',
        is_sse: false,
      }),
    ];

    const filtered = filterJobs(
      jobs,
      makeFilters({
        searchQuery: 'community',
        selectedSources: ['GoodWork'],
        showOnlySse: true,
        postedWithin: '2-weeks',
        now: new Date('2026-03-28T00:00:00Z').getTime(),
      }),
    );

    expect(filtered.map((job) => job.id)).toEqual(['recent-match']);
  });

  it('keeps jobs with null province and municipality when location filters are applied', () => {
    const jobs = [
      makeJob({ id: 'with-location' }),
      makeJob({
        id: 'missing-location',
        province: null,
        municipality: null,
      }),
    ];

    const filtered = filterJobs(
      jobs,
      makeFilters({
        selectedProvinces: ['Ontario'],
        selectedMunicipalities: ['Ottawa'],
      }),
    );

    expect(filtered.map((job) => job.id)).toEqual(['with-location', 'missing-location']);
  });

  it('sorts jobs by match score and salary', () => {
    const jobs = [
      makeJob({ id: 'mid', wage: '$20.00' }),
      makeJob({ id: 'high', wage: '$30.00' }),
      makeJob({ id: 'missing-salary', wage: null }),
    ];
    const matchData = new Map([
      ['mid', { score: 0.5, shared_values: [] }],
      ['high', { score: 0.9, shared_values: [] }],
      ['missing-salary', { score: 0.1, shared_values: [] }],
    ]);

    expect(sortJobs(jobs, 'match-desc', matchData).map((job) => job.id)).toEqual([
      'high',
      'mid',
      'missing-salary',
    ]);

    expect(sortJobs(jobs, 'salary-asc', matchData).map((job) => job.id)).toEqual([
      'mid',
      'high',
      'missing-salary',
    ]);
  });
});
