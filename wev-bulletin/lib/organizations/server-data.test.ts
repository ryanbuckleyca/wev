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

import {
  fetchOrganizationIndex,
  fetchOrganizationFilterOptions,
  getOrganizationJobs,
} from './server-data';

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
    description_en: null,
    description_fr: null,
    website: null,
    location: null,
    sse_rating: null,
    sse_details: null,
    is_sse: false,
    logo_url: null,
    mission_statement: null,
    mission_statement_en: null,
    mission_statement_fr: null,
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

  it('uses the RPC to fetch organizations sorted with active job counts and pagination total (default: all orgs)', async () => {
    mockRpc.mockResolvedValue({
      data: [makeRpcOrg(2, 'Alpha Org', 1), makeRpcOrg(1, 'Zeta Org', 2)],
      error: null,
    });

    const result = await fetchOrganizationIndex({ page: 1, activityDays: null });

    // Default SSE-only view with no user filters: single RPC (totalAvailable === total).
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('get_active_organizations', {
      min_date: null,
      p_limit: 20,
      p_offset: 0,
      p_search: null,
      p_sse_only: true,
      p_provinces: null,
      p_municipalities: null,
      p_org_types: null,
      p_languages: null,
      p_user_id: null,
      p_sort: 'org-asc',
    });
    expect(result.total).toBe(3);
    expect(result.totalAvailable).toBe(3);
    expect(result.orgs.map((org) => org.name)).toEqual(['Alpha Org', 'Zeta Org']);
    expect(result.orgs.map((org) => org.active_job_count)).toEqual([1, 2]);
  });

  it('passes the computed min_date when an activity window is provided', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await fetchOrganizationIndex({ activityDays: 28 });

    expect(mockRpc).toHaveBeenCalledWith(
      'get_active_organizations',
      expect.objectContaining({
        min_date: '2026-05-16T00:00:00.000Z',
      }),
    );

    await fetchOrganizationIndex({ activityDays: 90 });

    expect(mockRpc).toHaveBeenCalledWith(
      'get_active_organizations',
      expect.objectContaining({
        min_date: '2026-03-15T00:00:00.000Z',
      }),
    );
  });

  it('fetches a denominator scoped to the current SSE universe when user filters are set', async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: [makeRpcOrg(2, 'Alpha Org', 1)],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ ...makeRpcOrg(2, 'Alpha Org', 1), total_count: 10 }],
        error: null,
      });

    const result = await fetchOrganizationIndex({
      page: 1,
      searchQuery: 'alpha',
      sseOnly: true,
    });

    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc).toHaveBeenNthCalledWith(
      1,
      'get_active_organizations',
      expect.objectContaining({
        p_search: 'alpha',
        p_sse_only: true,
      }),
    );
    expect(mockRpc).toHaveBeenNthCalledWith(
      2,
      'get_active_organizations',
      expect.objectContaining({
        p_search: null,
        p_sse_only: true,
        p_limit: 1,
        p_provinces: null,
        p_municipalities: null,
        p_org_types: null,
        p_languages: null,
      }),
    );
    expect(result.totalAvailable).toBe(10);
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

  describe('fetchOrganizationFilterOptions', () => {
    it('queries all organizations when activityDays is null', async () => {
      organizationsQuery.setResult({
        data: [{ type: 'nonprofit', province: 'Quebec', municipality: 'Montreal', language: 'fr' }],
        error: null,
      });

      const options = await fetchOrganizationFilterOptions(null);

      expect(mockFrom).toHaveBeenCalledWith('organizations');
      expect(organizationsQuery.select).toHaveBeenCalledWith(
        'type, province, municipality, language',
      );
      // Should not include a job date filter
      expect(organizationsQuery.gte).not.toHaveBeenCalled();

      expect(options.types).toEqual(['nonprofit']);
      expect(options.provinces).toEqual(['Quebec']);
      expect(options.municipalitiesByProvince).toEqual({ Quebec: ['Montreal'] });
      expect(options.languages).toEqual(['fr']);
    });

    it('queries organizations with jobs when activityDays is set', async () => {
      organizationsQuery.setResult({
        data: [
          { type: 'cooperative', province: 'Ontario', municipality: 'Toronto', language: 'en' },
        ],
        error: null,
      });

      const options = await fetchOrganizationFilterOptions(28);

      expect(mockFrom).toHaveBeenCalledWith('organizations');
      expect(organizationsQuery.select).toHaveBeenCalledWith(
        'type, province, municipality, language, jobs!inner(date_posted)',
      );
      expect(organizationsQuery.gte).toHaveBeenCalledWith(
        'jobs.date_posted',
        '2026-05-16T00:00:00.000Z',
      );

      expect(options.types).toEqual(['cooperative']);
    });
  });
});
