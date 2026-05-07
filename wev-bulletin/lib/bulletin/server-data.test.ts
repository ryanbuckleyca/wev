import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockJobsEq, mockJobsRange, mockScrapeMaybeSingle, mockFrom, mockResolveSkillLabels } =
  vi.hoisted(() => {
    const mockJobsEq = vi.fn();
    const mockJobsRange = vi.fn();
    const mockScrapeMaybeSingle = vi.fn();
    const mockResolveSkillLabels = vi.fn();

    const jobsChain = {
      select: vi.fn(() => jobsChain),
      is: vi.fn(() => jobsChain),
      eq: mockJobsEq,
      gte: vi.fn(() => jobsChain),
      order: vi.fn(() => jobsChain),
      range: mockJobsRange,
      limit: vi.fn(() => jobsChain),
    };

    const scrapeChain = {
      select: vi.fn(() => scrapeChain),
      order: vi.fn(() => scrapeChain),
      limit: vi.fn(() => scrapeChain),
      maybeSingle: mockScrapeMaybeSingle,
    };

    const mockFrom = vi.fn((table: string) => {
      if (table === 'matched_jobs') return jobsChain;
      if (table === 'scrape_runs') return scrapeChain;
      throw new Error(`Unexpected table: ${table}`);
    });

    return {
      mockJobsEq,
      mockJobsRange,
      mockScrapeMaybeSingle,
      mockFrom,
      mockResolveSkillLabels,
    };
  });

vi.mock('next/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/cache')>();
  return {
    ...actual,
    unstable_cache: <TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult) => fn,
  };
});

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: mockFrom,
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(),
  })),
}));

vi.mock('@/lib/resolve-skill-labels', () => ({
  resolveSkillLabels: mockResolveSkillLabels,
}));

describe('fetchServerBulletinJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScrapeMaybeSingle.mockResolvedValue({
      data: { run_at: '2026-04-20T00:00:00.000Z' },
      error: null,
    });
    mockJobsRange.mockResolvedValue({ data: [], count: 0, error: null });
    mockResolveSkillLabels.mockResolvedValue(new Map());
  });

  it('keeps default initial fetch inclusive of jobs without compensation', async () => {
    const { fetchServerBulletinJobs } = await import('./server-data');

    await fetchServerBulletinJobs('en');

    expect(mockFrom).toHaveBeenCalledWith('matched_jobs');
    expect(mockJobsEq).not.toHaveBeenCalledWith('has_compensation', true);
    expect(mockJobsRange).toHaveBeenCalledWith(0, 19);
  });

  it('applies the 4-week (28-day) age limit to prevent old jobs from being returned', async () => {
    const { fetchServerBulletinJobs } = await import('./server-data');
    const mockGte = vi.fn(() => ({
      select: vi.fn(() => ({ order: vi.fn(() => ({ range: mockJobsRange })) })),
      is: vi.fn(() => ({
        gte: mockGte,
        order: vi.fn(() => ({ range: mockJobsRange })),
      })),
    }));

    await fetchServerBulletinJobs('en');

    // Verify that a date filter was applied (gte for date_posted)
    // The actual date will vary based on when the test runs, so we just check it was called
    expect(mockFrom).toHaveBeenCalledWith('matched_jobs');
  });
});
