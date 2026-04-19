import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { getRequestUser } from '@/lib/auth/request-user';
import { wireBookmarksRouteQueryMock } from '@/test-utils/bookmarks-route-mock';

/**
 * Handler contract: auth gate + real normalize/label pipeline with an empty DB result (no ESCO round-trip).
 * Supabase query chain is mocked at the client boundary — keep aligned with `route.ts` (from → select → eq → order).
 */
const { mockFrom, mockEq, mockOrder, mockSelect } = vi.hoisted(() => ({
  mockFrom: vi.fn().mockReturnThis(),
  mockSelect: vi.fn().mockReturnThis(),
  mockEq: vi.fn().mockReturnThis(),
  mockOrder: vi.fn().mockReturnThis(),
}));

vi.mock('@/lib/auth/request-user', () => ({
  getRequestUser: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: mockFrom,
    select: mockSelect,
    eq: mockEq,
    order: mockOrder,
  }),
}));

const mockGetRequestUser = vi.mocked(getRequestUser);

describe('GET /api/bookmarks (handler contract)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRequestUser.mockResolvedValue({
      ok: true,
      user: { id: 'bookmark-user-1', email: 'b@example.com' } as never,
    });

    wireBookmarksRouteQueryMock(
      mockFrom,
      mockEq,
      Promise.resolve({ data: [], error: null }),
      mockOrder,
    );
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetRequestUser.mockResolvedValue({
      ok: false,
      authError: new Error('Not authenticated'),
    });

    const response = await GET(new Request('http://localhost/api/bookmarks?locale=en'));
    expect(response.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns bookmarked jobs JSON for an authenticated user', async () => {
    const response = await GET(new Request('http://localhost/api/bookmarks?locale=en'));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { jobs: unknown[] };
    expect(Array.isArray(body.jobs)).toBe(true);
    expect(body.jobs).toHaveLength(0);

    expect(mockFrom).toHaveBeenCalledWith('jobs_with_match_scores');
    expect(mockEq).toHaveBeenCalledWith('bookmarks.user_id', 'bookmark-user-1');
    expect(mockOrder).toHaveBeenCalledWith('date_posted', { ascending: false });
  });

  it('returns 500 when Supabase returns an error', async () => {
    wireBookmarksRouteQueryMock(
      mockFrom,
      mockEq,
      Promise.resolve({ data: null, error: { message: 'query failed' } }),
      mockOrder,
    );

    const response = await GET(new Request('http://localhost/api/bookmarks'));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('query failed');
  });
});
