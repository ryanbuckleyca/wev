import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { getRequestUser } from '@/lib/auth/request-user';
import { fetchUserRolesFromService } from '@/lib/auth/server-user-roles';

vi.mock('@/lib/auth/request-user', () => ({
  getRequestUser: vi.fn(),
}));

vi.mock('@/lib/auth/server-user-roles', () => ({
  fetchUserRolesFromService: vi.fn(),
}));

const mockGetRequestUser = vi.mocked(getRequestUser);
const mockFetchUserRoles = vi.mocked(fetchUserRolesFromService);

describe('API Route: /api/auth/session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null user if not authenticated', async () => {
    // @ts-expect-error Mocking for test
    mockGetRequestUser.mockResolvedValue({ ok: false });

    const response = await GET();
    const body = await response.json();
    expect(body.user).toBeNull();
    expect(body.roles).toEqual(['user']);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate');
  });

  it('returns user data and roles if authenticated', async () => {
    // @ts-expect-error Mocking for test
    mockGetRequestUser.mockResolvedValue({ 
      ok: true, 
      user: { id: 'u123', email: 'test@example.com' } 
    });
    // @ts-expect-error Mocking for test
    mockFetchUserRoles.mockResolvedValue({ ok: true, roles: ['admin'] });

    const response = await GET();
    const body = await response.json();
    expect(body.user.id).toBe('u123');
    expect(body.roles).toEqual(['admin']);
  });
});
