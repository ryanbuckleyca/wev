import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  updatePasswordForCurrentUser,
  deleteAccountForCurrentUser,
  AccountServiceError,
} from './service';
import { PasswordVerifier, ValidationError, AuthenticationError } from './password-verifier';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { supabaseServer } from '@/lib/supabase-server';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    auth: {
      admin: {
        deleteUser: vi.fn(),
      },
    },
  },
}));

const { mockVerify } = vi.hoisted(() => ({
  mockVerify: vi.fn(),
}));

vi.mock('./password-verifier', () => {
  const MockVerifier = vi.fn().mockImplementation(function (this: any) {
    this.verify = mockVerify;
  });
  return {
    PasswordVerifier: MockVerifier,
    ValidationError: class extends Error {
      code = '';
      constructor(m: string, c: string) {
        super(m);
        this.code = c;
      }
    },
    AuthenticationError: class extends Error {
      code = '';
      constructor(m: string, c: string) {
        super(m);
        this.code = c;
      }
    },
  };
});

describe('AccountService', () => {
  const mockUpdateUser = vi.fn();
  const mockDeleteUser = vi.mocked(supabaseServer.auth.admin.deleteUser);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createServerClient).mockResolvedValue({
      auth: { updateUser: mockUpdateUser },
    } as any);
  });

  describe('updatePasswordForCurrentUser', () => {
    it('throws error if new password is too short', async () => {
      await expect(
        updatePasswordForCurrentUser({ currentPassword: 'p', newPassword: '1' }),
      ).rejects.toThrow(AccountServiceError);
    });

    it('successfully updates password if current is verified', async () => {
      mockVerify.mockResolvedValue(undefined);
      mockUpdateUser.mockResolvedValue({ error: null });
      await updatePasswordForCurrentUser({ currentPassword: 'old', newPassword: 'newPassword123' });
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newPassword123' });
    });

    it('allows setting initial password if no password set', async () => {
      mockVerify.mockRejectedValue(new AuthenticationError('no', 'NO_PASSWORD_SET'));
      mockUpdateUser.mockResolvedValue({ error: null });

      await updatePasswordForCurrentUser({ currentPassword: 'old', newPassword: 'newPassword123' });
      expect(mockUpdateUser).toHaveBeenCalled();
    });
  });

  describe('deleteAccountForCurrentUser', () => {
    it('successfully deletes account', async () => {
      mockVerify.mockResolvedValue(undefined);
      mockDeleteUser.mockResolvedValue({ error: null } as any);
      await deleteAccountForCurrentUser({ password: 'pw', userId: 'u1' });
      expect(mockDeleteUser).toHaveBeenCalledWith('u1');
    });

    it('allows deletion for OAuth users without password', async () => {
      mockVerify.mockRejectedValue(new AuthenticationError('no', 'NO_PASSWORD_SET'));
      mockDeleteUser.mockResolvedValue({ error: null } as any);

      await deleteAccountForCurrentUser({ password: 'pw', userId: 'u1' });
      expect(mockDeleteUser).toHaveBeenCalled();
    });

    it('throws error if delete fails', async () => {
      mockVerify.mockResolvedValue(undefined);
      mockDeleteUser.mockResolvedValue({ error: { message: 'Delete failed' } } as any);
      await expect(deleteAccountForCurrentUser({ password: 'pw', userId: 'u1' })).rejects.toThrow(
        'Delete failed',
      );
    });
  });
});
