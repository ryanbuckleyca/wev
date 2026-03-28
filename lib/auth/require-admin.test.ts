import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireAdminResponse, requireAdminSession } from './require-admin';

const mockGetUser = vi.fn();
const { mockFetchUserRolesFromService } = vi.hoisted(() => ({
  mockFetchUserRolesFromService: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

vi.mock('@/lib/auth/server-user-roles', () => ({
  fetchUserRolesFromService: mockFetchUserRolesFromService,
}));

describe('requireAdminSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when there is no session', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Not authenticated'),
    });

    const result = await requireAdminSession();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.response.status).toBe(401);
    expect(await result.response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when user_roles cannot be loaded', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1' } },
      error: null,
    });
    mockFetchUserRolesFromService.mockResolvedValue({ ok: false, error: new Error('db') });

    const result = await requireAdminSession();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 403 when roles do not include admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1' } },
      error: null,
    });
    mockFetchUserRolesFromService.mockResolvedValue({ ok: true, roles: ['user'] });

    const result = await requireAdminSession();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.response.status).toBe(403);
  });

  it('returns the user when session is admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'admin-id' } },
      error: null,
    });
    mockFetchUserRolesFromService.mockResolvedValue({ ok: true, roles: ['admin'] });

    const result = await requireAdminSession();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.user.id).toBe('admin-id');
  });
});

describe('requireAdminResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns NextResponse when not admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const denied = await requireAdminResponse();
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(401);
  });

  it('returns null when admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'a' } },
      error: null,
    });
    mockFetchUserRolesFromService.mockResolvedValue({ ok: true, roles: ['admin'] });

    expect(await requireAdminResponse()).toBeNull();
  });
});
