import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DELETE } from './route';
import { getRequestUser } from '@/lib/auth/request-user';
import { deleteAccountForCurrentUser, AccountServiceError } from '@/lib/account/service';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/request-user', () => ({
  getRequestUser: vi.fn(),
}));

vi.mock('@/lib/account/service', () => ({
  deleteAccountForCurrentUser: vi.fn(),
  AccountServiceError: class extends Error {
    constructor(public message: string, public status: number) {
      super(message);
      this.name = 'AccountServiceError';
    }
  },
}));

describe('DELETE /api/account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 if user is not authenticated', async () => {
    vi.mocked(getRequestUser).mockResolvedValue({ ok: false, authError: 'Unauthorized' } as any);

    const request = new NextRequest('http://localhost/api/account/delete', {
      method: 'DELETE',
    });

    const response = await DELETE(request);
    expect(response.status).toBe(401);
  });

  it('returns 200 on successful deletion', async () => {
    vi.mocked(getRequestUser).mockResolvedValue({ ok: true, user: { id: 'user-123' } } as any);
    vi.mocked(deleteAccountForCurrentUser).mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost/api/account/delete', {
      method: 'DELETE',
      body: JSON.stringify({ password: 'correct-password' }),
    });

    const response = await DELETE(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: 'Account successfully deleted' });
    expect(vi.mocked(deleteAccountForCurrentUser)).toHaveBeenCalledWith({
      userId: 'user-123',
      password: 'correct-password',
    });
  });

  it('returns error status if AccountServiceError is thrown', async () => {
    vi.mocked(getRequestUser).mockResolvedValue({ ok: true, user: { id: 'user-123' } } as any);
    vi.mocked(deleteAccountForCurrentUser).mockRejectedValue(
      new AccountServiceError('Invalid password', 403),
    );

    const request = new NextRequest('http://localhost/api/account/delete', {
      method: 'DELETE',
      body: JSON.stringify({ password: 'wrong-password' }),
    });

    const response = await DELETE(request);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Invalid password' });
  });
});
