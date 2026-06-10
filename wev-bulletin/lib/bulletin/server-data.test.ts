import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchLastScrapeTime,
  fetchServerMatchData,
  fetchServerBookmarks,
  fetchServerProfile,
  fetchCachedBulletinQueryPayload,
  fetchServerBulletinJobs,
} from './server-data';

const { mockQuery, mockSupabase } = vi.hoisted(() => {
  const query: any = {
    select: vi.fn(),
    filter: vi.fn(),
    textSearch: vi.fn(),
    gte: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
  };

  const setupChain = () => {
    query.select.mockReturnValue(query);
    query.filter.mockReturnValue(query);
    query.textSearch.mockReturnValue(query);
    query.gte.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.is.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.range.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.maybeSingle.mockReturnValue(query);

    // Default resolve for any awaited query
    query.then = vi.fn((onFulfilled: any) => {
      return Promise.resolve({ data: [], error: null, count: 0 }).then(onFulfilled);
    });
  };

  setupChain();

  const supabase = {
    from: vi.fn(() => query),
    auth: { getUser: vi.fn() },
  };

  return { mockQuery: query, mockSupabase: supabase as any, setupChain };
});

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: mockSupabase,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

vi.mock('@/lib/resolve-skill-labels', () => ({
  resolveSkillLabels: vi.fn().mockResolvedValue(new Map()),
}));

describe('server-data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.select.mockReturnValue(mockQuery);
    mockQuery.filter.mockReturnValue(mockQuery);
    mockQuery.textSearch.mockReturnValue(mockQuery);
    mockQuery.gte.mockReturnValue(mockQuery);
    mockQuery.in.mockReturnValue(mockQuery);
    mockQuery.is.mockReturnValue(mockQuery);
    mockQuery.eq.mockReturnValue(mockQuery);
    mockQuery.order.mockReturnValue(mockQuery);
    mockQuery.range.mockReturnValue(mockQuery);
    mockQuery.limit.mockReturnValue(mockQuery);
    mockQuery.maybeSingle.mockReturnValue(mockQuery);
    mockQuery.then.mockImplementation((onFulfilled: any) => {
      return Promise.resolve({ data: [], error: null, count: 0 }).then(onFulfilled);
    });
  });

  describe('fetchCachedBulletinQueryPayload', () => {
    const defaultInput = {
      locale: 'en' as const,
      page: 1,
      limit: 20,
      searchQuery: '',
      sortBy: 'date-desc',
      postedWithin: 'all',
      orgs: [],
      provs: [],
      munis: [],
      emps: [],
      srcs: [],
      works: [],
      langs: [],
      onlySse: false,
      noSalary: false,
      userCacheKey: 'test-key',
    };

    it('successfully fetches bulletin payload', async () => {
      const result = await fetchCachedBulletinQueryPayload(defaultInput);
      expect(result).toHaveProperty('jobs');
      expect(result).toHaveProperty('total');
    });

    it('applies filters and search', async () => {
      await fetchCachedBulletinQueryPayload({
        ...defaultInput,
        searchQuery: 'test',
        orgs: ['Org1'],
        onlySse: true,
      });
      expect(mockQuery.in).toHaveBeenCalledWith('organization', ['Org1']);
      expect(mockQuery.is).toHaveBeenCalledWith('is_sse', true);
      expect(mockQuery.order).toHaveBeenCalled();
    });

    it('throws error if jobs fetch fails', async () => {
      mockQuery.then.mockImplementation((onFulfilled: any) => {
        return Promise.resolve({ data: null, error: { message: 'Jobs Error' } }).then(onFulfilled);
      });
      await expect(fetchCachedBulletinQueryPayload(defaultInput)).rejects.toThrow('Jobs Error');
    });

    it('throws error if filter options fetch fails', async () => {
      mockQuery.then.mockImplementation((onFulfilled: any) => {
        // Inspect query to target filter options fetch
        const isFilterQuery = mockQuery.select.mock.calls.some((call: any) =>
          call[0]?.includes('organization, province, municipality, employment_type, source'),
        );

        if (isFilterQuery) {
          return Promise.resolve({ data: null, error: { message: 'Filter Error' } }).then(
            onFulfilled,
          );
        }
        return Promise.resolve({ data: [], error: null }).then(onFulfilled);
      });
      await expect(fetchCachedBulletinQueryPayload(defaultInput)).rejects.toThrow('Filter Error');
    });
  });

  describe('fetchServerBulletinJobs', () => {
    it('fetches initial jobs', async () => {
      const result = await fetchServerBulletinJobs('en');
      expect(result).toHaveProperty('jobs');
    });
  });

  describe('fetchLastScrapeTime', () => {
    it('returns run_at', async () => {
      mockQuery.then.mockImplementation((onFulfilled: any) => {
        return Promise.resolve({ data: { run_at: '2024-01-01' }, error: null }).then(onFulfilled);
      });
      const result = await fetchLastScrapeTime();
      expect(result).toBe('2024-01-01');
    });

    it('throws error on failure', async () => {
      mockQuery.then.mockImplementation((onFulfilled: any) => {
        return Promise.resolve({ data: null, error: { message: 'Error' } }).then(onFulfilled);
      });
      await expect(fetchLastScrapeTime()).rejects.toThrow('Error');
    });
  });

  describe('fetchServerMatchData', () => {
    it('returns matches', async () => {
      const mockData = [{ job_id: 'j1', score: 1 }];
      mockQuery.then.mockImplementation((onFulfilled: any) => {
        return Promise.resolve({ data: mockData, error: null }).then(onFulfilled);
      });
      const result = await fetchServerMatchData('u1');
      expect(result['j1']).toBeDefined();
    });

    it('returns empty object on error or no data', async () => {
      mockQuery.then.mockImplementation((onFulfilled: any) => {
        return Promise.resolve({ data: null, error: { message: 'Error' } }).then(onFulfilled);
      });
      expect(await fetchServerMatchData('u1')).toEqual({});

      mockQuery.then.mockImplementation((onFulfilled: any) => {
        return Promise.resolve({ data: null, error: null }).then(onFulfilled);
      });
      expect(await fetchServerMatchData('u1')).toEqual({});
    });
  });

  describe('fetchServerBookmarks', () => {
    it('returns job ids', async () => {
      mockQuery.then.mockImplementation((onFulfilled: any) => {
        return Promise.resolve({ data: [{ job_id: 'j1' }], error: null }).then(onFulfilled);
      });
      const result = await fetchServerBookmarks('u1');
      expect(result).toEqual(['j1']);
    });

    it('returns empty array on error or no data', async () => {
      mockQuery.then.mockImplementation((onFulfilled: any) => {
        return Promise.resolve({ data: null, error: { message: 'Error' } }).then(onFulfilled);
      });
      expect(await fetchServerBookmarks('u1')).toEqual([]);

      mockQuery.then.mockImplementation((onFulfilled: any) => {
        return Promise.resolve({ data: null, error: null }).then(onFulfilled);
      });
      expect(await fetchServerBookmarks('u1')).toEqual([]);
    });
  });

  describe('fetchServerProfile', () => {
    it('returns profile', async () => {
      mockQuery.then.mockImplementation((onFulfilled: any) => {
        return Promise.resolve({ data: { id: 'u1' }, error: null }).then(onFulfilled);
      });
      const result = await fetchServerProfile('u1');
      expect(result?.id).toBe('u1');
    });

    it('returns null on error or no data', async () => {
      mockQuery.then.mockImplementation((onFulfilled: any) => {
        return Promise.resolve({ data: null, error: { message: 'Error' } }).then(onFulfilled);
      });
      expect(await fetchServerProfile('u1')).toBeNull();

      mockQuery.then.mockImplementation((onFulfilled: any) => {
        return Promise.resolve({ data: null, error: null }).then(onFulfilled);
      });
      expect(await fetchServerProfile('u1')).toBeNull();
    });

    it('returns null on catch block', async () => {
      mockQuery.then.mockImplementation(() => {
        throw new Error('Unexpected error');
      });
      const result = await fetchServerProfile('u1');
      expect(result).toBeNull();
    });
  });
});
