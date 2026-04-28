import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PasswordVerifier, ValidationError, AuthenticationError } from './password-verifier';
import { createClient as createServerClient } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

describe('PasswordVerifier', () => {
  const mockRpc = vi.fn();
  const mockSupabase = {
    rpc: mockRpc,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createServerClient).mockResolvedValue(
      mockSupabase as unknown as Awaited<ReturnType<typeof createServerClient>>,
    );

    // Default mock behavior
    mockRpc.mockResolvedValue({
      data: 'match',
      error: null,
    });
  });

  describe('verify', () => {
    it('returns successfully for valid credentials', async () => {
      const verifier = new PasswordVerifier();
      await expect(verifier.verify('password123')).resolves.not.toThrow();

      expect(mockRpc).toHaveBeenCalledWith('verify_user_password', {
        password: 'password123',
      });
    });

    it('throws AuthenticationError for invalid credentials', async () => {
      mockRpc.mockResolvedValue({
        data: 'mismatch',
        error: null,
      });

      const verifier = new PasswordVerifier();
      await expect(verifier.verify('wrong-password')).rejects.toThrow(AuthenticationError);
    });

    it('throws AuthenticationError with NO_PASSWORD_SET code for users without passwords', async () => {
      mockRpc.mockResolvedValue({
        data: 'no_password',
        error: null,
      });

      const verifier = new PasswordVerifier();
      try {
        await verifier.verify('some-password');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError);
        expect((error as AuthenticationError).code).toBe('NO_PASSWORD_SET');
      }
    });

    it('throws AuthenticationError for RPC error', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const verifier = new PasswordVerifier();
      await expect(verifier.verify('password123')).rejects.toThrow(AuthenticationError);
    });
  });

  describe('input validation', () => {
    it('detects no_password even for empty password', async () => {
      mockRpc.mockResolvedValue({
        data: 'no_password',
        error: null,
      });

      const verifier = new PasswordVerifier();
      try {
        await verifier.verify('');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError);
        expect((error as AuthenticationError).code).toBe('NO_PASSWORD_SET');
      }
    });

    it('rejects empty password if account has a password', async () => {
      mockRpc.mockResolvedValue({
        data: 'mismatch',
        error: null,
      });

      const verifier = new PasswordVerifier();
      await expect(verifier.verify('')).rejects.toThrow(ValidationError);
    });

    it('rejects password shorter than 8 characters if account has a password', async () => {
      mockRpc.mockResolvedValue({
        data: 'mismatch',
        error: null,
      });

      const verifier = new PasswordVerifier();
      await expect(verifier.verify('short')).rejects.toThrow(ValidationError);
    });
  });
});
