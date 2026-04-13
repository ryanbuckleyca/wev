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
    (createServerClient as any).mockResolvedValue(mockSupabase);
    
    // Default mock behavior
    mockRpc.mockResolvedValue({ 
      data: true, 
      error: null 
    });
  });

  describe('verify', () => {
    it('returns successfully for valid credentials', async () => {
      const verifier = new PasswordVerifier();
      await expect(verifier.verify('password123')).resolves.not.toThrow();
      
      expect(mockRpc).toHaveBeenCalledWith('verify_user_password', {
        password: 'password123'
      });
    });

    it('throws AuthenticationError for invalid credentials', async () => {
      mockRpc.mockResolvedValue({
        data: false,
        error: null
      });

      const verifier = new PasswordVerifier();
      await expect(verifier.verify('wrong-password')).rejects.toThrow(AuthenticationError);
    });

    it('throws AuthenticationError for RPC error', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      const verifier = new PasswordVerifier();
      await expect(verifier.verify('password123')).rejects.toThrow(AuthenticationError);
    });
  });

  describe('input validation', () => {
    it('rejects empty password', async () => {
      const verifier = new PasswordVerifier();
      await expect(verifier.verify('')).rejects.toThrow(ValidationError);
    });

    it('rejects password shorter than 8 characters', async () => {
      const verifier = new PasswordVerifier();
      await expect(verifier.verify('short')).rejects.toThrow(ValidationError);
    });
  });
});


