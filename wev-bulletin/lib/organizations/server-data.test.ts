import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = {
  count?: number | null;
  data: any;
  error: any;
};

const { jobsQuery, organizationsQuery, mockFrom, mockRpc } = vi.hoisted(() => {
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
      then: vi.fn(
        (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
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

  const rpc = vi.fn();

  return {
    jobsQuery: jobs,
    organizationsQuery: organizations,
    mockFrom: from,
    mockRpc: rpc,
  };
});

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

vi.mock('@/lib/resolve-skill-labels', () => ({
  parseLocale: (value: string | null) => ((value ?? '').toLowerCase() === 'fr' ? 'fr' : 'en'),
  resolveSkillLabels: vi.fn(async () => new Map()),
  attachSkillLabels: vi.fn((jobs: unknown[]) =>
    jobs.map((job) => ({ ...(job as object), skill_labels: {} })),
  ),
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

function makeRpcOrg(id: number, name: string, active_job_count: number) {
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
    mission_statement: null,
    values_list: null,
    values_rated: null,
    active_job_count,
    total_count: 3,
  };
}

describe('organizations/server-data', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T00:00:00.000Z'));
    vi.clearAllMocks();
    resetQuery(jobsQuery);
    resetQuery(organizationsQuery);
    mockRpc.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the RPC to fetch organizations sorted with active job counts and pagination total', async () => {
    mockRpc.mockResolvedValue({
      data: [makeRpcOrg(2, 'Alpha Org', 1), makeRpcOrg(1, 'Zeta Org', 2)],
      error: null,
    });

    const result = await fetchOrganizationIndex({ page: 1 });

    // First call: the actual filtered page
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'get_active_organizations', {
      min_date: '2026-05-16T00:00:00.000Z',
      p_limit: 20,
      p_offset: 0,
      p_search: null,
      p_sse_only: true,
      p_provinces: null,
      p_municipalities: null,
      p_org_types: null,
      p_user_id: null,
      p_sort: 'org-asc',
    });
    // Second call: denominator (p_sse_only: false, p_limit: 1)
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'get_active_organizations', expect.objectContaining({
      p_sse_only: false,
      p_limit: 1,
      p_offset: 0,
    }));
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(result.total).toBe(3);
    expect(result.totalAvailable).toBe(3);
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

    const result = await getOrganizationJobs({ orgId: 42, page: 2 });

    expect(mockFrom).toHaveBeenCalledWith('jobs');
    expect(jobsQuery.eq).toHaveBeenCalledWith('organization_id', 42);
    expect(jobsQuery.gte).toHaveBeenCalledWith('date_posted', '2026-05-16T00:00:00.000Z');
    expect(jobsQuery.order).toHaveBeenCalledWith('date_posted', { ascending: false });
    expect(jobsQuery.range).toHaveBeenCalledWith(20, 39);
    expect(result.total).toBe(1);
    expect(result.jobs).toHaveLength(1);
  });
});
