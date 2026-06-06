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
    then: vi.fn(),
  };

  const resetQuery = () => {
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
    query.then.mockImplementation((onFullfilled: any) => {
      return Promise.resolve({ data: [], error: null, count: 0 }).then(onFullfilled);
    });
  };

  resetQuery();

  const supabase = {
    from: vi.fn(() => query),
    auth: { getUser: vi.fn() },
  };

  return { mockQuery: query, mockSupabase: supabase, resetQuery };
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
    mockQuery.then.mockImplementation((onFullfilled: any) => {
      return Promise.resolve({ data: [], error: null, count: 0 }).then(onFullfilled);
    });
    mockSupabase.from.mockReturnValue(mockQuery);
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
      onlySse: false,
      noSalary: false,
      userCacheKey: 'test-key',
    };

    it('successfully fetches bulletin payload with filters', async () => {
      mockQuery.then.mockImplementation((onFullfilled: any) => {
        return Promise.resolve({ data: [], error: null, count: 0 }).then(onFullfilled);
      });

      const result = await fetchCachedBulletinQueryPayload(defaultInput);

      expect(result).toHaveProperty('jobs');
      expect(result).toHaveProperty('total');
      expect(mockSupabase.from).toHaveBeenCalledWith('matched_jobs');
    });

    it('applies search query and filters', async () => {
      await fetchCachedBulletinQueryPayload({
        ...defaultInput,
        searchQuery: 'developer',
        orgs: ['Company A'],
        onlySse: true,
      });

      // It might call textSearch or filter depending on search-utils logic
      const searchCalled = mockQuery.textSearch.mock.calls.length > 0 || mockQuery.filter.mock.calls.length > 0;
      expect(searchCalled).toBe(true);
      expect(mockQuery.in).toHaveBeenCalledWith('organization', ['Company A']);
      expect(mockQuery.is).toHaveBeenCalledWith('is_sse', true);
    });

    it('applies age filters based on postedWithin', async () => {
      await fetchCachedBulletinQueryPayload({
        ...defaultInput,
        postedWithin: '1-week',
      });

      expect(mockQuery.gte).toHaveBeenCalled();
    });

    it('applies various sorting options', async () => {
      const sortOptions = [
        'date-asc',
        'match-desc',
        'value-match-desc',
        'skill-match-desc',
        'salary-desc',
        'salary-asc',
        'org-asc',
      ];

      for (const sortBy of sortOptions) {
        await fetchCachedBulletinQueryPayload({
          ...defaultInput,
          sortBy,
        });
      }

      expect(mockQuery.order).toHaveBeenCalled();
    });

    it('retries with "fts" column on 42703 error', async () => {
      let callCount = 0;
      mockQuery.then.mockImplementation((onFullfilled: any) => {
        callCount++;
        // Identify which query it is based on the calls
        const fromCalls = mockSupabase.from.mock.calls as any[][];
        const lastFromCall = fromCalls.length > 0 ? fromCalls[fromCalls.length - 1][0] : null;

        if (lastFromCall === 'scrape_runs') {
          return Promise.resolve({ data: { run_at: 'now' }, error: null }).then(onFullfilled);
        }

        // Return 42703 for the first 'matched_jobs' query that is not totalAvailable (head: true)
        const isMatchedJobs = lastFromCall === 'matched_jobs';
        const selectCalls = mockQuery.select.mock.calls as any[][];
        const lastSelectArgs = selectCalls.length > 0 ? selectCalls[selectCalls.length - 1][1] : null;
        const isTotalAvailable = lastSelectArgs?.head === true;

        // Check if this is the facets query (it has limit(5000))
        const limitCalls = mockQuery.limit.mock.calls as any[][];
        const lastLimitArg = limitCalls.length > 0 ? limitCalls[limitCalls.length - 1][0] : null;
        const isFacets = lastLimitArg === 5000;

        if (isFacets) {
          return Promise.resolve({ data: [], error: null }).then(onFullfilled);
        }

        if (isMatchedJobs && !isTotalAvailable && callCount <= 6) {
          // Return error for jobs query
          return Promise.resolve({ data: null, error: { code: '42703', message: 'Error' } }).then(onFullfilled);
        }

        return Promise.resolve({ data: [], error: null, count: 0 }).then(onFullfilled);
      });

      await fetchCachedBulletinQueryPayload({
        ...defaultInput,
        searchQuery: 'test',
      });

      expect(mockSupabase.from).toHaveBeenCalled();
    });
  });

  describe('fetchServerBulletinJobs', () => {
    it('successfully fetches initial bulletin jobs', async () => {
      const result = await fetchServerBulletinJobs('en');
      expect(result).toHaveProperty('jobs');
      expect(result).toHaveProperty('total');
      expect(mockSupabase.from).toHaveBeenCalledWith('matched_jobs');
    });

    it('throws error if jobs fetch fails', async () => {
      mockQuery.then.mockImplementation((onFullfilled: any) => {
        return Promise.resolve({ data: null, error: { message: 'Fetch failed' } }).then(onFullfilled);
      });

      await expect(fetchServerBulletinJobs('en')).rejects.toThrow('Fetch failed');
    });
  });

  describe('fetchLastScrapeTime', () => {
    it('returns run_at from the latest scrape run', async () => {
      const mockData = { run_at: '2024-03-15T10:00:00Z' };
      mockQuery.then.mockImplementation((onFullfilled: any) => {
        return Promise.resolve({ data: mockData, error: null }).then(onFullfilled);
      });

      const result = await fetchLastScrapeTime();
      expect(result).toBe('2024-03-15T10:00:00Z');
    });

    it('returns null if no scrape runs found', async () => {
      mockQuery.then.mockImplementation((onFullfilled: any) => {
        return Promise.resolve({ data: null, error: null }).then(onFullfilled);
      });

      const result = await fetchLastScrapeTime();
      expect(result).toBeNull();
    });

    it('throws error if supabase fails', async () => {
      mockQuery.then.mockImplementation((onFullfilled: any) => {
        return Promise.resolve({ data: null, error: { message: 'DB Error' } }).then(onFullfilled);
      });

      await expect(fetchLastScrapeTime()).rejects.toThrow('DB Error');
    });
  });

  describe('fetchServerMatchData', () => {
    it('returns serialized match data for a user', async () => {
      const mockData = [
        {
          job_id: 'job-1',
          score: 85,
          value_score: 10,
          skill_score: 20,
          work_type_score: 30,
          location_score: 25,
          shared_values: ['V1'],
          shared_skills: ['S1'],
        },
      ];

      mockQuery.then.mockImplementation((onFullfilled: any) => {
        return Promise.resolve({ data: mockData, error: null }).then(onFullfilled);
      });

      const result = await fetchServerMatchData('user-1');
      expect(result['job-1']).toEqual({
        score: 85,
        value_score: 10,
        skill_score: 20,
        work_type_score: 30,
        location_score: 25,
        shared_values: ['V1'],
        shared_skills: ['S1'],
      });
    });

    it('returns empty object on error', async () => {
      mockQuery.then.mockImplementation((onFullfilled: any) => {
        return Promise.resolve({ data: null, error: { message: 'Error' } }).then(onFullfilled);
      });

      const result = await fetchServerMatchData('user-1');
      expect(result).toEqual({});
    });
  });

  describe('fetchServerBookmarks', () => {
    it('returns array of bookmarked job IDs', async () => {
      mockQuery.then.mockImplementation((onFullfilled: any) => {
        return Promise.resolve({ data: [{ job_id: 'j1' }, { job_id: 'j2' }], error: null }).then(onFullfilled);
      });

      const result = await fetchServerBookmarks('user-1');
      expect(result).toEqual(['j1', 'j2']);
    });

    it('returns empty array on error', async () => {
      mockQuery.then.mockImplementation((onFullfilled: any) => {
        return Promise.resolve({ data: null, error: { message: 'Error' } }).then(onFullfilled);
      });

      const result = await fetchServerBookmarks('user-1');
      expect(result).toEqual([]);
    });
  });

  describe('fetchServerProfile', () => {
    it('returns profile for a user', async () => {
      const mockProfile = { id: 'user-1', full_name: 'Test User' };
      mockQuery.then.mockImplementation((onFullfilled: any) => {
        return Promise.resolve({ data: mockProfile, error: null }).then(onFullfilled);
      });

      const result = await fetchServerProfile('user-1');
      expect(result).toEqual(mockProfile);
    });

    it('returns null on error', async () => {
      mockQuery.then.mockImplementation((onFullfilled: any) => {
        return Promise.resolve({ data: null, error: { message: 'Error' } }).then(onFullfilled);
      });

      const result = await fetchServerProfile('user-1');
      expect(result).toBeNull();
    });
  });
});
