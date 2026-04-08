import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { getRequestUser } from '@/lib/auth/request-user';

/**
 * Handler contract: auth gate + real normalize/label pipeline with an empty DB result (no ESCO round-trip).
 * Supabase query chain is mocked at the client boundary — keep aligned with `route.ts` (from → select → eq → order).
 */
const { mockFrom, mockEq } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockEq: vi.fn(),
}));

vi.mock('@/lib/auth/request-user', () => ({
  getRequestUser: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: mockFrom,
  },
}));

const mockGetRequestUser = vi.mocked(getRequestUser);

describe('GET /api/bookmarks (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRequestUser.mockResolvedValue({
      ok: true,
      user: { id: 'bookmark-user-1', email: 'b@example.com' } as never,
    });

    const emptyJobsResponse = Promise.resolve({ data: [], error: null });
    mockEq.mockReturnValue({
      order: vi.fn(() => emptyJobsResponse),
    });
    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: mockEq,
      })),
    });
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

    expect(mockFrom).toHaveBeenCalledWith('jobs');
    expect(mockEq).toHaveBeenCalledWith('bookmarks.user_id', 'bookmark-user-1');
  });

  it('returns 500 when Supabase returns an error', async () => {
    mockEq.mockReturnValue({
      order: vi.fn(() => Promise.resolve({ data: null, error: { message: 'query failed' } })),
    });
    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: mockEq,
      })),
    });

    const response = await GET(new Request('http://localhost/api/bookmarks'));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('query failed');
  });
});
