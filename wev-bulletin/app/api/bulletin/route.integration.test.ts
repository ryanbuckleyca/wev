import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import {
  fetchSkillLabels,
  fetchLastScrapeTime,
  fetchBulletinFilterOptions,
} from '@/lib/bulletin/server-data';
import { queryBulletinJobs } from '@/lib/bulletin/query-builder';
import { createClient } from '@/lib/supabase/server';

/**
 * Route handler contract: locale parsing + cache policy + server-data shape.
 * Dependencies are mocked so the suite does not require a live DB (CI-safe).
 */
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/bulletin/server-data', () => ({
  fetchSkillLabels: vi.fn(),
  fetchLastScrapeTime: vi.fn(),
  fetchBulletinFilterOptions: vi.fn(),
  BULLETIN_CACHE_TAG: 'bulletin-meta',
}));

vi.mock('@/lib/bulletin/query-builder', () => ({
  queryBulletinJobs: vi.fn(),
}));

const mockCreateClient = vi.mocked(createClient);
const mockQueryBulletinJobs = vi.mocked(queryBulletinJobs);
const mockFetchSkillLabels = vi.mocked(fetchSkillLabels);
const mockFetchLastScrapeTime = vi.mocked(fetchLastScrapeTime);
const mockFetchBulletinFilterOptions = vi.mocked(fetchBulletinFilterOptions);

describe('GET /api/bulletin (handler contract)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Supabase client
    mockCreateClient.mockResolvedValue({} as any);

    // Default mock returns
    mockQueryBulletinJobs.mockResolvedValue({
      jobs: [],
      totalCount: 0,
    });
    mockFetchSkillLabels.mockResolvedValue({});
    mockFetchLastScrapeTime.mockResolvedValue('2020-01-01T00:00:00.000Z');
    mockFetchBulletinFilterOptions.mockResolvedValue({
      organizations: [],
      provinces: [],
      municipalitiesByProvince: {},
      employmentTypes: [],
      sources: [],
    });
  });

  it('returns JSON and Cache-Control with correct locale', async () => {
    const response = await GET(new Request('http://localhost/api/bulletin?locale=fr'));

    // Verify locale was parsed and passed correctly
    expect(mockQueryBulletinJobs).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locale: 'fr' }),
    );
    expect(mockFetchSkillLabels).toHaveBeenCalledWith('fr');

    expect(response.status).toBe(200);
    // New cache control uses private and max-age=10
    expect(response.headers.get('Cache-Control')).toContain('private');
    expect(response.headers.get('Cache-Control')).toContain('max-age=10');

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.jobs).toEqual([]);
    expect(body.totalCount).toBe(0);
    expect(body.lastScrapeTime).toBe('2020-01-01T00:00:00.000Z');
    expect(body.skillLabels).toEqual({});
    expect(body.filterOptions).toBeDefined();
  });

  it('parses filter and pagination parameters from the URL', async () => {
    const url =
      'http://localhost/api/bulletin?q=developer&page=2&sort=salary-desc&org=Apple,Google&sse=false';
    await GET(new Request(url));

    expect(mockQueryBulletinJobs).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filters: expect.objectContaining({
          searchQuery: 'developer',
          selectedOrganizations: ['Apple', 'Google'],
          showOnlySse: false,
        }),
        sortBy: 'salary-desc',
        page: 2,
      }),
    );
  });

  it('defaults locale to English when the locale query is missing or invalid', async () => {
    await GET(new Request('http://localhost/api/bulletin?locale=de'));
    expect(mockFetchSkillLabels).toHaveBeenCalledWith('en');
  });

  it('returns 500 when queryBulletinJobs throws', async () => {
    mockQueryBulletinJobs.mockRejectedValue(new Error('db unavailable'));

    const response = await GET(new Request('http://localhost/api/bulletin'));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('db unavailable');
  });
});
