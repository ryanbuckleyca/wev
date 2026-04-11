import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { getRequestUser } from '@/lib/auth/request-user';
import { fetchUserRolesFromService } from '@/lib/auth/server-user-roles';
import { logger } from '@/lib/logger';

vi.mock('@/lib/auth/request-user', () => ({
  getRequestUser: vi.fn(),
}));

vi.mock('@/lib/auth/server-user-roles', () => ({
  fetchUserRolesFromService: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockGetRequestUser = vi.mocked(getRequestUser);
const mockFetchUserRolesFromService = vi.mocked(fetchUserRolesFromService);
const mockWarn = vi.mocked(logger.warn);

describe('GET /api/auth/roles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 with default roles when the request is unauthenticated', async () => {
    mockGetRequestUser.mockResolvedValue({
      ok: false,
      authError: new Error('Not authenticated'),
    });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ roles: ['user'] });
    expect(mockFetchUserRolesFromService).not.toHaveBeenCalled();
  });

  it('falls back to default user role and logs a warning when role loading fails', async () => {
    const loadError = new Error('db down');
    mockGetRequestUser.mockResolvedValue({
      ok: true,
      user: { id: 'user-1' } as never,
    });
    mockFetchUserRolesFromService.mockResolvedValue({
      ok: false,
      error: loadError,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ roles: ['user'] });
    expect(mockWarn).toHaveBeenCalledWith(
      { err: loadError, userId: 'user-1' },
      'Roles route: falling back to default user role',
    );
  });

  it('returns loaded roles for an authenticated user', async () => {
    mockGetRequestUser.mockResolvedValue({
      ok: true,
      user: { id: 'admin-1' } as never,
    });
    mockFetchUserRolesFromService.mockResolvedValue({
      ok: true,
      roles: ['admin', 'user'],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ roles: ['admin', 'user'] });
  });
});
