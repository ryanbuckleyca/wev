import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { fetchBulletinJobs } from '@/lib/bulletin/server-data';

/**
 * Handler contract: route + locale parsing + cache policy + server-data shape.
 * `fetchBulletinJobs` is mocked so the suite does not require a live DB (CI-safe).
 */
vi.mock('@/lib/bulletin/server-data', () => ({
  fetchBulletinJobs: vi.fn(),
}));

const mockFetchBulletinJobs = vi.mocked(fetchBulletinJobs);

describe('GET /api/bulletin (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchBulletinJobs.mockResolvedValue({
      jobs: [],
      lastScrapeTime: '2020-01-01T00:00:00.000Z',
      skillLabels: {},
    });
  });

  it('returns JSON and Cache-Control with locale from query', async () => {
    const response = await GET(new Request('http://localhost/api/bulletin?locale=fr'));

    expect(mockFetchBulletinJobs).toHaveBeenCalledWith('fr');
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('max-age=300');
    expect(response.headers.get('Cache-Control')).toContain('stale-while-revalidate');

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.jobs).toEqual([]);
    expect(body.lastScrapeTime).toBe('2020-01-01T00:00:00.000Z');
    expect(body.skillLabels).toEqual({});
  });

  it('defaults locale to English when the locale query is missing', async () => {
    await GET(new Request('http://localhost/api/bulletin'));
    expect(mockFetchBulletinJobs).toHaveBeenCalledWith('en');
  });

  it('defaults locale to English when the locale query is not fr', async () => {
    await GET(new Request('http://localhost/api/bulletin?locale=de'));
    expect(mockFetchBulletinJobs).toHaveBeenCalledWith('en');
  });

  it('returns 500 when fetchBulletinJobs throws', async () => {
    mockFetchBulletinJobs.mockRejectedValue(new Error('db unavailable'));

    const response = await GET(new Request('http://localhost/api/bulletin'));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('db unavailable');
  });
});
