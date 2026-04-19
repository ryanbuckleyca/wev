import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { fetchLastScrapeTime } from '@/lib/bulletin/server-data';
import { resolveSkillLabels } from '../../../lib/resolve-skill-labels';

/**
 * Route handler contract: locale parsing + param translation + data aggregation.
 */

// Mock Supabase Server Client
vi.mock('@/lib/supabase/server', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {
    select: vi.fn(() => chain),
    textSearch: vi.fn(() => chain),
    in: vi.fn(() => chain),
    is: vi.fn(() => chain),
    or: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(() => Promise.resolve({ data: [], count: 0, error: null })),
  };
  return {
    createClient: vi.fn(async () => ({
      from: vi.fn(() => chain),
    })),
  };
});

// Mock Server Data
vi.mock('@/lib/bulletin/server-data', () => ({
  fetchLastScrapeTime: vi.fn(),
  BULLETIN_CACHE_TAG: 'bulletin-jobs',
}));

// Mock Resolve Skill Labels
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
  });

  it('returns JSON and Cache-Control with locale from query', async () => {
    const response = await GET(new Request('http://localhost/api/bulletin?locale=fr'));

    expect(response.status).toBe(200);
    // Explicit cache eviction since DB controls everything now natively
    expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.jobs).toEqual([]);
    expect(body.lastScrapeTime).toBe('2020-01-01T00:00:00.000Z');
    expect(body.skillLabels).toEqual({});
  });

  it('returns 500 when fetch throws', async () => {
    mockFetchLastScrapeTime.mockRejectedValue(new Error('db unavailable'));

    const response = await GET(new Request('http://localhost/api/bulletin'));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('db unavailable');
  });
});
