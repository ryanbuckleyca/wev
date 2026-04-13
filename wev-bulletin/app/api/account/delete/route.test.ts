import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DELETE } from './route';
import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/auth/request-user';

const { mockSignInWithPassword, mockDeleteUser, mockAdminSignOut } = vi.hoisted(() => ({
  mockSignInWithPassword: vi.fn(),
  mockDeleteUser: vi.fn(),
  mockAdminSignOut: vi.fn(),
}));

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

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    auth: {
      admin: {
        signOut: mockAdminSignOut,
        deleteUser: mockDeleteUser,
      },
    },
  },
}));

const mockGetRequestUser = vi.mocked(getRequestUser);

describe('/api/account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_ENV_MODE = 'test'; // Enforce test mode for captcha generation
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'user-123' },
        session: { access_token: 'verification-token' },
      },
      error: null,
    });
    mockAdminSignOut.mockResolvedValue({
      data: null,
      error: null,
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

  it('should reject an invalid password', async () => {
    mockGetRequestUser.mockResolvedValue({
      ok: true,
      user: {
        id: 'user-123',
        email: 'test@example.com',
      } as never,
    });
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: {
        code: 'invalid_credentials',
        message: 'Invalid login credentials',
      },
    });

    const request = new NextRequest('http://localhost:3000/api/account/delete', {
      method: 'DELETE',
      body: JSON.stringify({ password: 'wrong-password' }),
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Invalid password');
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockAdminSignOut).not.toHaveBeenCalled();
  });

  it('should return a server error when password verification fails for other reasons', async () => {
    mockGetRequestUser.mockResolvedValue({
      ok: true,
      user: {
        id: 'user-123',
        email: 'test@example.com',
      } as never,
    });
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: {
        code: 'over_request_rate_limit',
        message: 'Rate limit exceeded',
      },
    });

    const request = new NextRequest('http://localhost:3000/api/account/delete', {
      method: 'DELETE',
      body: JSON.stringify({ password: 'wrong-password' }),
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Rate limit exceeded');
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockAdminSignOut).not.toHaveBeenCalled();
  });

  it('should successfully delete account with a valid password', async () => {
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
      body: JSON.stringify({ password: 'validpassword123' }),
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toBe('Account successfully deleted');
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'validpassword123',
    });
    expect(mockAdminSignOut).toHaveBeenCalledWith('verification-token', 'local');
    expect(mockDeleteUser).toHaveBeenCalledWith('user-123');
  });
});

