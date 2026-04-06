import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRequestUser } from './request-user';

const mockGetSession = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getSession: mockGetSession,
    },
  })),
}));

describe('getRequestUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns failure when Supabase reports an auth error', async () => {
    const authError = new Error('Not authenticated');
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: authError,
    });

    const result = await getRequestUser();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.authError).toBe(authError);
  });

  it('returns failure when no user is present', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const result = await getRequestUser();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.authError).toBeNull();
  });

  it('returns the authenticated user on success', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });

    const result = await getRequestUser();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.user.id).toBe('user-1');
  });
});
