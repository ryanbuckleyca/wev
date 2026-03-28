import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DELETE } from './route';
import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/auth/request-user';

const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockFrom = vi.fn();
const mockDeleteUser = vi.fn();

vi.mock('@/lib/auth/request-user', () => ({
  getRequestUser: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseServer: vi.fn(() => ({
    from: mockFrom,
    auth: {
      admin: {
        deleteUser: mockDeleteUser,
      },
    },
  })),
}));

const mockGetRequestUser = vi.mocked(getRequestUser);

describe('/api/account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock chains
    mockEq.mockResolvedValue({ error: null });
    mockDelete.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({
      delete: mockDelete,
    });
  });

  it('should require authentication', async () => {
    mockGetRequestUser.mockResolvedValue({
      ok: false,
      authError: new Error('Not authenticated'),
    });

    const request = new NextRequest('http://localhost:3000/api/account/delete', {
      method: 'DELETE',
      body: JSON.stringify({ password: 'test123' }),
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should require password', async () => {
    mockGetRequestUser.mockResolvedValue({
      ok: true,
      user: {
        id: 'user-123',
        email: 'test@example.com',
      } as never,
    });

    const request = new NextRequest('http://localhost:3000/api/account/delete', {
      method: 'DELETE',
      body: JSON.stringify({}), // No password
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Password required for account deletion');
  });

  it('should successfully delete account with password provided', async () => {
    mockGetRequestUser.mockResolvedValue({
      ok: true,
      user: {
        id: 'user-123',
        email: 'test@example.com',
      } as never,
    });

    // Mock successful user deletion
    mockDeleteUser.mockResolvedValue({
      data: {},
      error: null,
    });

    const request = new NextRequest('http://localhost:3000/api/account/delete', {
      method: 'DELETE',
      body: JSON.stringify({ password: 'anypassword' }),
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toBe('Account successfully deleted');

    // Verify deletion calls were made
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockFrom).toHaveBeenCalledWith('user_roles');
    expect(mockDeleteUser).toHaveBeenCalledWith('user-123');
  });
});
