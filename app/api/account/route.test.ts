import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';
import { getRequestUser } from '@/lib/auth/request-user';

const mockSignInWithPassword = vi.fn();
const mockUpdateUser = vi.fn();

vi.mock('@/lib/auth/request-user', () => ({
  getRequestUser: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
    },
  })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      updateUser: mockUpdateUser,
    },
  })),
}));

const mockGetRequestUser = vi.mocked(getRequestUser);

describe('/api/account PATCH', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockUpdateUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
  });

  it('requires authentication', async () => {
    mockGetRequestUser.mockResolvedValue({
      ok: false,
      authError: new Error('Not authenticated'),
    });

    const request = new NextRequest('http://localhost:3000/api/account', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword: 'old-pass', newPassword: 'new-pass' }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('requires the current password', async () => {
    mockGetRequestUser.mockResolvedValue({
      ok: true,
      user: {
        id: 'user-123',
        email: 'test@example.com',
      } as never,
    });

    const request = new NextRequest('http://localhost:3000/api/account', {
      method: 'PATCH',
      body: JSON.stringify({ newPassword: 'new-pass' }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Current password is required.');
  });

  it('rejects an invalid current password', async () => {
    mockGetRequestUser.mockResolvedValue({
      ok: true,
      user: {
        id: 'user-123',
        email: 'test@example.com',
      } as never,
    });
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: new Error('Invalid login credentials'),
    });

    const request = new NextRequest('http://localhost:3000/api/account', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword: 'wrong-pass', newPassword: 'new-pass' }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Current password is incorrect.');
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('updates the password when the current password is valid', async () => {
    mockGetRequestUser.mockResolvedValue({
      ok: true,
      user: {
        id: 'user-123',
        email: 'test@example.com',
      } as never,
    });

    const request = new NextRequest('http://localhost:3000/api/account', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword: 'old-pass', newPassword: 'new-pass' }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toBe('Password updated successfully');
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'new-pass' });
  });
});
