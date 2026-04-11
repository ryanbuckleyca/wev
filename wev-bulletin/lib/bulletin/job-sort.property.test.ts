/**
 * Property-based tests for salary sort in `sortJobs`
 *
 * Uses parameterized test cases (it.each) to cover a wide range of inputs.
 *
 * Property 9: Sort Stability for Unstructured Jobs
 *   Validates: Requirements 12.2, 12.3
 *
 * Property 10: Sort Ordering Correctness
 *   Validates: Requirements 12.4, 12.5
 */

import { describe, it, expect } from 'vitest';
import type { JobPosting } from '@/lib/supabase';
import { sortJobs } from './job-query';
import { toAnnual } from '@/lib/compensation/helpers';
import type { CompensationUnit } from '@/lib/compensation/constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;

function makeStructuredJob(
  min_value: number,
  unit_text: CompensationUnit,
  hours_per_week?: number | null,
): JobPosting {
  idCounter++;
  return {
    id: `structured-${idCounter}`,
    job_title: 'Job',
    organization: 'Org',
    location: 'Ottawa, ON',
    municipality: 'Ottawa',
    province: 'Ontario',
    work_type: 'hybrid',
    date_posted: '2026-01-01T00:00:00',
    close_date: null,
    wage: null,
    listing_url: 'https://example.com',
    employment_type: 'Full-time',
    summary: null,
    is_sse: false,
    source: 'GoodWork',
    min_value,
    unit_text,
    hours_per_week: hours_per_week ?? null,
  };
}

function makeUnstructuredJob(): JobPosting {
  idCounter++;
  return {
    id: `unstructured-${idCounter}`,
    job_title: 'Job',
    organization: 'Org',
    location: 'Ottawa, ON',
    municipality: 'Ottawa',
    province: 'Ontario',
    work_type: 'hybrid',
    date_posted: '2026-01-01T00:00:00',
    close_date: null,
    wage: 'Competitive',
    listing_url: 'https://example.com',
    employment_type: 'Full-time',
    summary: null,
    is_sse: false,
    source: 'GoodWork',
    min_value: null,
    unit_text: null,
    hours_per_week: null,
  };
}

const noMatchData = new Map();

function annualValue(job: JobPosting): number | null {
  if (job.min_value == null || job.unit_text == null) return null;
  const annual = toAnnual(BigInt(job.min_value), job.unit_text, job.hours_per_week);
  return annual != null ? Number(annual) : null;
}

// ---------------------------------------------------------------------------
// Property 9: Sort Stability for Unstructured Jobs
// Validates: Requirements 12.2, 12.3
// ---------------------------------------------------------------------------

describe('Property 9: Sort Stability for Unstructured Jobs', () => {
  /**
   * Mixed lists of structured and unstructured jobs.
   * After sorting, all unstructured jobs (min_value IS NULL) must appear
   * after all structured jobs in both salary-desc and salary-asc directions.
   */

  const mixedCases = [
    {
      label: 'one structured, one unstructured',
      jobs: () => [makeUnstructuredJob(), makeStructuredJob(5_000_000, 'YEAR')],
    },
    {
      label: 'multiple structured, multiple unstructured interleaved',
      jobs: () => [
        makeUnstructuredJob(),
        makeStructuredJob(3_000_000, 'YEAR'),
        makeUnstructuredJob(),
        makeStructuredJob(6_000_000, 'YEAR'),
        makeUnstructuredJob(),
      ],
    },
    {
      label: 'hourly structured jobs with unstructured',
      jobs: () => [
        makeUnstructuredJob(),
        makeStructuredJob(2500, 'HOUR', 40),
        makeUnstructuredJob(),
        makeStructuredJob(3000, 'HOUR', null),
      ],
    },
    {
      label: 'monthly structured jobs with unstructured',
      jobs: () => [
        makeStructuredJob(500_000, 'MONTH'),
        makeUnstructuredJob(),
        makeStructuredJob(400_000, 'MONTH'),
        makeUnstructuredJob(),
      ],
    },
    {
      label: 'all unstructured',
      jobs: () => [makeUnstructuredJob(), makeUnstructuredJob(), makeUnstructuredJob()],
    },
    {
      label: 'all structured',
      jobs: () => [
        makeStructuredJob(7_000_000, 'YEAR'),
        makeStructuredJob(5_000_000, 'YEAR'),
        makeStructuredJob(3_000_000, 'YEAR'),
      ],
    },
  ];

  it.each(
    mixedCases.flatMap(({ label, jobs }) =>
      (['salary-desc', 'salary-asc'] as const).map((dir) => ({ label, jobs, dir })),
    ),
  )('$dir: unstructured jobs appear after structured — $label', ({ jobs, dir }) => {
    const input = jobs();
    const sorted = sortJobs(input, dir, noMatchData);

    // Find the index of the last structured job and the first unstructured job
    const lastStructuredIdx = sorted.reduce(
      (last, job, i) => (job.min_value != null ? i : last),
      -1,
    );
    const firstUnstructuredIdx = sorted.findIndex((job) => job.min_value == null);

    // If there are both structured and unstructured jobs, all unstructured must come after all structured
    if (lastStructuredIdx !== -1 && firstUnstructuredIdx !== -1) {
      expect(firstUnstructuredIdx).toBeGreaterThan(lastStructuredIdx);
    }
  });
});

// ---------------------------------------------------------------------------
// Property 10: Sort Ordering Correctness
// Validates: Requirements 12.4, 12.5
// ---------------------------------------------------------------------------

describe('Property 10: Sort Ordering Correctness', () => {
  /**
   * For salary-desc: consecutive structured jobs have non-increasing annual values.
   * For salary-asc: consecutive structured jobs have non-decreasing annual values.
   */

  const structuredCases = [
    {
      label: 'annual jobs with different values',
      jobs: () => [
        makeStructuredJob(3_000_000, 'YEAR'),
        makeStructuredJob(7_000_000, 'YEAR'),
        makeStructuredJob(5_000_000, 'YEAR'),
      ],
    },
    {
      label: 'hourly jobs with different rates',
      jobs: () => [
        makeStructuredJob(2000, 'HOUR', 40),
        makeStructuredJob(5000, 'HOUR', 40),
        makeStructuredJob(3500, 'HOUR', 40),
      ],
    },
    {
      label: 'mixed units — hourly, monthly, annual',
      jobs: () => [
        makeStructuredJob(2500, 'HOUR', 40), // ~$5,200,000/yr
        makeStructuredJob(400_000, 'MONTH'), // $4,800,000/yr
        makeStructuredJob(6_000_000, 'YEAR'), // $6,000,000/yr
      ],
    },
    {
      label: 'jobs with inferred hours (null hours_per_week)',
      jobs: () => [
        makeStructuredJob(3000, 'HOUR', null), // uses 40h default
        makeStructuredJob(2000, 'HOUR', null),
        makeStructuredJob(4000, 'HOUR', null),
      ],
    },
    {
      label: 'jobs with stated non-default hours',
      jobs: () => [
        makeStructuredJob(3000, 'HOUR', 35),
        makeStructuredJob(3000, 'HOUR', 40),
        makeStructuredJob(3000, 'HOUR', 20),
      ],
    },
    {
      label: 'single structured job (trivially ordered)',
      jobs: () => [makeStructuredJob(5_000_000, 'YEAR')],
    },
    {
      label: 'two structured jobs with equal annual values',
      jobs: () => [makeStructuredJob(5_000_000, 'YEAR'), makeStructuredJob(5_000_000, 'YEAR')],
    },
  ];

  describe('salary-desc: structured jobs have non-increasing annual values', () => {
    it.each(structuredCases)('$label', ({ jobs }) => {
      const input = jobs();
      const sorted = sortJobs(input, 'salary-desc', noMatchData);
      const structuredSorted = sorted.filter((j) => j.min_value != null);

      for (let i = 0; i < structuredSorted.length - 1; i++) {
        const curr = annualValue(structuredSorted[i])!;
        const next = annualValue(structuredSorted[i + 1])!;
        expect(curr).toBeGreaterThanOrEqual(next);
      }
    });
  });

  describe('salary-asc: structured jobs have non-decreasing annual values', () => {
    it.each(structuredCases)('$label', ({ jobs }) => {
      const input = jobs();
      const sorted = sortJobs(input, 'salary-asc', noMatchData);
      const structuredSorted = sorted.filter((j) => j.min_value != null);

      for (let i = 0; i < structuredSorted.length - 1; i++) {
        const curr = annualValue(structuredSorted[i])!;
        const next = annualValue(structuredSorted[i + 1])!;
        expect(curr).toBeLessThanOrEqual(next);
      }
    });
  });
});
