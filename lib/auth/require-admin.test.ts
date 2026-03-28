import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireAdminResponse, requireAdminSession } from './require-admin';

const { mockFetchUserRolesFromService } = vi.hoisted(() => ({
  mockFetchUserRolesFromService: vi.fn(),
}));
const { mockGetRequestUser } = vi.hoisted(() => ({
  mockGetRequestUser: vi.fn(),
}));

vi.mock('./request-user', () => ({
  getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/auth/server-user-roles', () => ({
  fetchUserRolesFromService: mockFetchUserRolesFromService,
}));

describe('requireAdminSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when there is no session', async () => {
    mockGetRequestUser.mockResolvedValue({
      ok: false,
      authError: new Error('Not authenticated'),
    });

    const result = await requireAdminSession();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.response.status).toBe(401);
    expect(await result.response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when user_roles cannot be loaded', async () => {
    mockGetRequestUser.mockResolvedValue({
      ok: true,
      user: { id: 'u1' },
    });
    mockFetchUserRolesFromService.mockResolvedValue({ ok: false, error: new Error('db') });

    const result = await requireAdminSession();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 403 when roles do not include admin', async () => {
    mockGetRequestUser.mockResolvedValue({
      ok: true,
      user: { id: 'u1' },
    });
    mockFetchUserRolesFromService.mockResolvedValue({ ok: true, roles: ['user'] });

    const result = await requireAdminSession();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.response.status).toBe(403);
  });

  it('returns the user when session is admin', async () => {
    mockGetRequestUser.mockResolvedValue({
      ok: true,
      user: { id: 'admin-id' },
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
    mockGetRequestUser.mockResolvedValue({
      ok: false,
      authError: null,
    });

    const denied = await requireAdminResponse();
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(401);
  });

  it('returns null when admin', async () => {
    mockGetRequestUser.mockResolvedValue({
      ok: true,
      user: { id: 'a' },
    });
    mockFetchUserRolesFromService.mockResolvedValue({ ok: true, roles: ['admin'] });

    expect(await requireAdminResponse()).toBeNull();
  });
});
