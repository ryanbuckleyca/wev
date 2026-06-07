import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
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
    } as unknown as SupabaseClient);
  });

  describe('updatePasswordForCurrentUser', () => {
    it('throws error if new password is too short', async () => {
      try {
        await updatePasswordForCurrentUser({ currentPassword: 'p', newPassword: '1' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AccountServiceError);
        const err = error as AccountServiceError;
        expect(err.code).toBe('PASSWORD_TOO_SHORT');
        expect(err.message).toBeDefined();
      }
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

    it('throws error if updateUser returns error', async () => {
      mockVerify.mockResolvedValue(undefined);
      mockUpdateUser.mockResolvedValue({ error: new Error('Update failed') });

      await expect(
        updatePasswordForCurrentUser({ currentPassword: 'old', newPassword: 'newPassword123' }),
      ).rejects.toThrow('Update failed');
    });

    it('throws error if verification fails with non-NO_PASSWORD_SET AuthenticationError', async () => {
      mockVerify.mockRejectedValue(new AuthenticationError('invalid', 'INVALID_PASSWORD'));

      await expect(
        updatePasswordForCurrentUser({ currentPassword: 'old', newPassword: 'newPassword123' }),
      ).rejects.toThrow('invalid');
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
      mockDeleteUser.mockResolvedValue({ error: new Error('Delete failed') } as any);
      await expect(deleteAccountForCurrentUser({ password: 'pw', userId: 'u1' })).rejects.toThrow(
        'Delete failed',
      );
    });

    it('throws error if verification fails with non-NO_PASSWORD_SET AuthenticationError', async () => {
      mockVerify.mockRejectedValue(new AuthenticationError('invalid', 'INVALID_PASSWORD'));

      await expect(deleteAccountForCurrentUser({ password: 'pw', userId: 'u1' })).rejects.toThrow(
        'invalid',
      );
      expect(mockDeleteUser).not.toHaveBeenCalled();
    });
  });
});
