import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { fetchBulletinQueryPayload } from '@/lib/bulletin/server-data';
import { PRODUCT_DEFAULT_POSTED_WITHIN } from '@/lib/bulletin/constants';
import type { BulletinQueryInput } from '@/lib/bulletin/server-data';

/**
 * Route handler contract: the GET handler is a thin adapter. It parses/validates
 * query params, applies SSE/compensation backward-compat, and delegates to the
 * shared `fetchBulletinQueryPayload`. SQL translation is covered in
 * `lib/bulletin/server-data.test.ts`, so here we assert the parsed input.
 */

const SENTINEL_CLIENT = { id: 'supabase-client' };
const PAYLOAD = {
  jobs: [] as unknown[],
  total: 0,
  totalAvailable: 0,
  lastScrapeTime: '2020-01-01T00:00:00.000Z',
  skillLabels: {},
  filterOptions: {},
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => SENTINEL_CLIENT),
}));

vi.mock('@/lib/resolve-skill-labels', () => ({
  parseLocale: vi.fn((val) => (val === 'fr' ? 'fr' : 'en')),
}));

vi.mock('@/lib/bulletin/server-data', () => ({
  BULLETIN_CACHE_TAG: 'bulletin-jobs',
  fetchBulletinQueryPayload: vi.fn(),
}));

const mockFetchPayload = vi.mocked(fetchBulletinQueryPayload);

/** Runs GET and returns the input object passed to fetchBulletinQueryPayload. */
async function capturedInputFor(url: string): Promise<BulletinQueryInput> {
  await GET(new Request(url));
  const call = mockFetchPayload.mock.calls.at(-1);
  if (!call) throw new Error('fetchBulletinQueryPayload was not called');
  return call[0];
}

describe('GET /api/bulletin (handler contract)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPayload.mockResolvedValue(PAYLOAD as never);
  });

  it('returns JSON and no-store Cache-Control, delegating with the request client', async () => {
    const response = await GET(new Request('http://localhost/api/bulletin?locale=fr'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    expect(await response.json()).toEqual(PAYLOAD);

    const [, client] = mockFetchPayload.mock.calls[0]!;
    expect(client).toBe(SENTINEL_CLIENT);
  });

  it('parses locale from the query', async () => {
    expect((await capturedInputFor('http://localhost/api/bulletin?locale=fr')).locale).toBe('fr');
    expect((await capturedInputFor('http://localhost/api/bulletin')).locale).toBe('en');
  });

  it('clamps pagination params to bounded safe values', async () => {
    const over = await capturedInputFor('http://localhost/api/bulletin?page=-20&limit=99999');
    expect(over.page).toBe(1);
    expect(over.limit).toBe(100);

    const nan = await capturedInputFor('http://localhost/api/bulletin?page=x&limit=y');
    expect(nan.page).toBe(1);
    expect(nan.limit).toBe(20);

    const high = await capturedInputFor('http://localhost/api/bulletin?page=50000&limit=50');
    expect(high.page).toBe(1000);
    expect(high.limit).toBe(50);
  });

  it('defaults sort and posted window, and passes explicit values through', async () => {
    const defaults = await capturedInputFor('http://localhost/api/bulletin');
    expect(defaults.sortBy).toBe('date-desc');
    expect(defaults.postedWithin).toBe(PRODUCT_DEFAULT_POSTED_WITHIN);

    const explicit = await capturedInputFor(
      'http://localhost/api/bulletin?sortBy=salary-desc&postedWithin=1-week',
    );
    expect(explicit.sortBy).toBe('salary-desc');
    expect(explicit.postedWithin).toBe('1-week');
  });

  it('collects repeated array filters', async () => {
    const input = await capturedInputFor(
      'http://localhost/api/bulletin?orgs=Org+A&orgs=Org+B&langs=en&langs=fr',
    );
    expect(input.orgs).toEqual(['Org A', 'Org B']);
    expect(input.langs).toEqual(['en', 'fr']);
  });

  it('trims and truncates the search query', async () => {
    const input = await capturedInputFor('http://localhost/api/bulletin?q=  hello world  ');
    expect(input.searchQuery).toBe('hello world');
  });

  it('defaults to SSE-only and resolves sse/nonSse backward compatibility', async () => {
    expect((await capturedInputFor('http://localhost/api/bulletin')).onlySse).toBe(true);
    expect((await capturedInputFor('http://localhost/api/bulletin?sse=true')).onlySse).toBe(true);
    expect((await capturedInputFor('http://localhost/api/bulletin?sse=false')).onlySse).toBe(false);
    expect((await capturedInputFor('http://localhost/api/bulletin?nonSse=true')).onlySse).toBe(
      false,
    );
    expect((await capturedInputFor('http://localhost/api/bulletin?nonSse=false')).onlySse).toBe(
      true,
    );
    // nonSse takes precedence over the legacy sse param.
    expect(
      (await capturedInputFor('http://localhost/api/bulletin?sse=true&nonSse=true')).onlySse,
    ).toBe(false);
  });

  it('maps the nosal param to includeUnlistedPay (default false)', async () => {
    expect((await capturedInputFor('http://localhost/api/bulletin')).includeUnlistedPay).toBe(
      false,
    );
    expect(
      (await capturedInputFor('http://localhost/api/bulletin?nosal=true')).includeUnlistedPay,
    ).toBe(true);
  });

  it('returns 500 with the error message when the query fails', async () => {
    mockFetchPayload.mockRejectedValue(new Error('db unavailable'));

    const response = await GET(new Request('http://localhost/api/bulletin'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'db unavailable' });
  });
});
