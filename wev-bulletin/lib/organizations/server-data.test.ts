import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = {
  count?: number | null;
  data: any;
  error: any;
};

const { jobsQuery, organizationsQuery, mockFrom } = vi.hoisted(() => {
  const createQuery = () => {
    let result: QueryResult = { data: null, error: null, count: null };
    const query: any = {
      eq: vi.fn(() => query),
      gte: vi.fn(() => query),
      in: vi.fn(() => query),
      not: vi.fn(() => query),
      order: vi.fn(() => query),
      range: vi.fn(() => query),
      select: vi.fn(() => query),
      then: vi.fn((onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled, onRejected),
      ),
      setResult(nextResult: QueryResult) {
        result = nextResult;
      },
    };
    return query;
  };

  const jobs = createQuery();
  const organizations = createQuery();
  const from = vi.fn((table: string) => {
    if (table === 'jobs') return jobs;
    if (table === 'organizations') return organizations;
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    jobsQuery: jobs,
    organizationsQuery: organizations,
    mockFrom: from,
  };
});

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: mockFrom,
  },
}));

import { fetchOrganizationIndex, getOrganizationJobs } from './server-data';

function resetQuery(query: any) {
  query.select.mockClear().mockReturnValue(query);
  query.not.mockClear().mockReturnValue(query);
  query.gte.mockClear().mockReturnValue(query);
  query.in.mockClear().mockReturnValue(query);
  query.eq.mockClear().mockReturnValue(query);
  query.order.mockClear().mockReturnValue(query);
  query.range.mockClear().mockReturnValue(query);
  query.then.mockClear();
  query.setResult({ data: null, error: null, count: null });
}

function makeOrg(id: number, name: string) {
  return {
    id,
    created_at: '2026-06-01T00:00:00.000Z',
    name,
    values: null,
    type: null,
    slug: `${name.toLowerCase()}-${id}`,
    description: null,
    website: null,
    location: null,
    sse_rating: null,
    sse_details: null,
    is_sse: false,
    logo_url: null,
  };
}

describe('organizations/server-data', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T00:00:00.000Z'));
    vi.clearAllMocks();
    resetQuery(jobsQuery);
    resetQuery(organizationsQuery);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('filters active organizations by date_posted, ignores null organization ids, and sorts alphabetically', async () => {
    jobsQuery.setResult({
      data: [
        { organization_id: 2 },
        { organization_id: 1 },
        { organization_id: 1 },
        { organization_id: null },
      ],
      error: null,
    });
    organizationsQuery.setResult({
      data: [makeOrg(1, 'Zeta Org'), makeOrg(2, 'Alpha Org')],
      error: null,
    });

    const result = await fetchOrganizationIndex(1);

    expect(mockFrom).toHaveBeenCalledWith('jobs');
    expect(jobsQuery.not).toHaveBeenCalledWith('organization_id', 'is', null);
    expect(jobsQuery.gte).toHaveBeenCalledWith('date_posted', '2026-05-16T00:00:00.000Z');
    expect(mockFrom).toHaveBeenCalledWith('organizations');
    expect(organizationsQuery.in).toHaveBeenCalledWith('id', [2, 1]);
    expect(result.total).toBe(2);
    expect(result.orgs.map((org) => org.name)).toEqual(['Alpha Org', 'Zeta Org']);
    expect(result.orgs.map((org) => org.active_job_count)).toEqual([1, 2]);
  });

  it('fetches organization jobs using the date_posted age window and pagination', async () => {
    jobsQuery.setResult({
      data: [
        {
          id: 'job-1',
          job_title: 'Coordinator',
          listing_url: 'https://example.com/job-1',
          date_posted: '2026-06-10T00:00:00.000Z',
          employment_type: 'full-time',
          location: 'Montreal',
          work_type: 'hybrid',
        },
      ],
      error: null,
      count: 1,
    });

    const result = await getOrganizationJobs(42, 2);

    expect(mockFrom).toHaveBeenCalledWith('jobs');
    expect(jobsQuery.eq).toHaveBeenCalledWith('organization_id', 42);
    expect(jobsQuery.gte).toHaveBeenCalledWith('date_posted', '2026-05-16T00:00:00.000Z');
    expect(jobsQuery.order).toHaveBeenCalledWith('date_posted', { ascending: false });
    expect(jobsQuery.range).toHaveBeenCalledWith(20, 39);
    expect(result.total).toBe(1);
    expect(result.jobs).toHaveLength(1);
  });
});
