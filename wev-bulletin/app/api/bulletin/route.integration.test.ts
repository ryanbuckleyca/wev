import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { fetchLastScrapeTime } from '@/lib/bulletin/server-data';
import { resolveSkillLabels } from '@/lib/resolve-skill-labels';

/**
 * Route handler contract: locale parsing + param translation + data aggregation.
 */

const {
  mockFrom,
  mockSelect,
  mockTextSearch,
  mockIn,
  mockIs,
  mockEq,
  mockGte,
  mockOrder,
  mockRange,
  mockLimit,
} = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockTextSearch = vi.fn();
  const mockIn = vi.fn();
  const mockIs = vi.fn();
  const mockEq = vi.fn();
  const mockGte = vi.fn();
  const mockOrder = vi.fn();
  const mockRange = vi.fn();
  const mockLimit = vi.fn();
  return {
    mockFrom,
    mockSelect,
    mockTextSearch,
    mockIn,
    mockIs,
    mockEq,
    mockGte,
    mockOrder,
    mockRange,
    mockLimit,
  };
});

vi.mock('next/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/cache')>();
  return {
    ...actual,
    unstable_cache: <TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult) => fn,
  };
});

// Mock Supabase Server Client
vi.mock('@/lib/supabase/server', () => {
  const chain: Record<string, any> = {
    then: (onFullfilled: any) =>
      Promise.resolve({ data: [], count: 0, error: null }).then(onFullfilled),
  };
  mockSelect.mockImplementation(() => chain);
  mockTextSearch.mockImplementation(() => chain);
  mockIn.mockImplementation(() => chain);
  mockIs.mockImplementation(() => chain);
  mockEq.mockImplementation(() => chain);
  mockGte.mockImplementation(() => chain);
  mockOrder.mockImplementation(() => chain);
  mockRange.mockImplementation(() => Promise.resolve({ data: [], count: 0, error: null }));
  mockLimit.mockImplementation(() => Promise.resolve({ data: [], count: 0, error: null }));

  chain.select = mockSelect;
  chain.textSearch = mockTextSearch;
  chain.in = mockIn;
  chain.is = mockIs;
  chain.eq = mockEq;
  chain.gte = mockGte;
  chain.order = mockOrder;
  chain.range = mockRange;
  chain.limit = mockLimit;

  return {
    createClient: vi.fn(async () => ({
      from: mockFrom.mockImplementation(() => chain),
    })),
  };
});

// Mock Server Data
vi.mock('@/lib/bulletin/server-data', () => ({
  fetchLastScrapeTime: vi.fn(),
  BULLETIN_CACHE_TAG: 'bulletin-jobs',
  BULLETIN_CACHE_REVALIDATE_SECONDS: 60,
  BULLETIN_JOB_SELECT:
    'id, job_title, organization, location, municipality, province, work_type, date_posted, close_date, wage, listing_url, employment_type, summary, is_sse, source, values, skills, unit_text, min_value, max_value, hours_per_week',
}));

vi.mock('@/lib/resolve-skill-labels', () => ({
  resolveSkillLabels: vi.fn(),
  parseLocale: vi.fn((val) => (val === 'fr' ? 'fr' : 'en')),
}));

const mockFetchLastScrapeTime = vi.mocked(fetchLastScrapeTime);
const mockResolveSkillLabels = vi.mocked(resolveSkillLabels);

describe('GET /api/bulletin (handler contract)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchLastScrapeTime.mockResolvedValue('2020-01-01T00:00:00.000Z');
    mockResolveSkillLabels.mockResolvedValue(new Map());
    mockRange.mockResolvedValue({ data: [], count: 0, error: null });
  });

  it('returns JSON and Cache-Control with locale from query', async () => {
    const response = await GET(new Request('http://localhost/api/bulletin?locale=fr'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    expect(mockFrom).toHaveBeenCalledWith('matched_jobs');

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.jobs).toEqual([]);
    expect(body.lastScrapeTime).toBe('2020-01-01T00:00:00.000Z');
    expect(body.skillLabels).toEqual({});
  });

  it('clamps pagination params to bounded safe values', async () => {
    await GET(new Request('http://localhost/api/bulletin?page=-20&limit=99999'));
    expect(mockRange).toHaveBeenCalledWith(0, 99);

    await GET(new Request('http://localhost/api/bulletin?page=not-a-number&limit=also-bad'));
    expect(mockRange).toHaveBeenCalledWith(0, 19);

    await GET(new Request('http://localhost/api/bulletin?page=50000&limit=50'));
    expect(mockRange).toHaveBeenCalledWith(49_950, 49_999);
  });

  it('uses locale-aware websearch FTS and skips empty search text', async () => {
    // Multi-word query uses websearch
    await GET(new Request('http://localhost/api/bulletin?locale=fr&q=  economie sociale  '));
    expect(mockTextSearch).toHaveBeenCalledWith('fts_fr', 'economie sociale', {
      type: 'websearch',
    });

    // Single word query uses prefix matching (fts type)
    await GET(new Request('http://localhost/api/bulletin?locale=en&q=part'));
    expect(mockTextSearch).toHaveBeenCalledWith('fts_en', 'part:*', {
      type: 'fts',
    });

    vi.clearAllMocks();
    mockFetchLastScrapeTime.mockResolvedValue('2020-01-01T00:00:00.000Z');
    mockResolveSkillLabels.mockResolvedValue(new Map());
    mockRange.mockResolvedValue({ data: [], count: 0, error: null });

    await GET(new Request('http://localhost/api/bulletin?locale=en&q=   '));
    expect(mockTextSearch).not.toHaveBeenCalled();
  });

  it('falls back to legacy fts column when locale-aware FTS columns are unavailable', async () => {
    mockRange
      .mockResolvedValueOnce({
        data: null,
        count: null,
        error: { code: '42703', message: 'undefined column' },
      })
      .mockResolvedValueOnce({ data: [], count: 0, error: null });

    await GET(new Request('http://localhost/api/bulletin?locale=en&q=Community Builder 25'));

    // Called for both jobs query and filter options query
    expect(mockTextSearch).toHaveBeenCalledWith('fts_en', 'Community Builder 25', {
      type: 'websearch',
    });
    expect(mockTextSearch).toHaveBeenCalledWith('fts', 'Community Builder 25', {
      type: 'websearch',
    });
  });

  it('translates sort and filters into query-chain calls', async () => {
    await GET(
      new Request(
        'http://localhost/api/bulletin?sortBy=salary-desc&sse=true&orgs=Org+A&orgs=Org+B&postedWithin=1-week',
      ),
    );

    expect(mockIs).toHaveBeenCalledWith('is_sse', true);
    expect(mockIn).toHaveBeenCalledWith('organization', ['Org A', 'Org B']);
    expect(mockEq).toHaveBeenCalledWith('has_compensation', true);
    expect(mockOrder).toHaveBeenCalledWith('min_value', { ascending: false, nullsFirst: false });
    expect(mockGte).toHaveBeenCalledWith('date_posted', expect.any(String));
  });

  it('returns 500 when fetch throws', async () => {
    mockFetchLastScrapeTime.mockRejectedValue(new Error('db unavailable'));

    const response = await GET(new Request('http://localhost/api/bulletin'));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('db unavailable');
  });

  it('always applies 4-week (28 day) age limit regardless of postedWithin filter', async () => {
    // Even when postedWithin=any, should still filter to 28 days max
    await GET(new Request('http://localhost/api/bulletin?postedWithin=any'));
    expect(mockGte).toHaveBeenCalledWith('date_posted', expect.any(String));
  });

  it('returns both total (filtered) and totalAvailable (all non-old jobs)', async () => {
    mockRange.mockResolvedValue({ data: [{ id: 'job-1' }], count: 5, error: null });

    const response = await GET(new Request('http://localhost/api/bulletin'));
    const body = (await response.json()) as Record<string, unknown>;

    // Should have both: total (matching filters) and totalAvailable (all jobs <= 4 weeks)
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('totalAvailable');
  });
});
