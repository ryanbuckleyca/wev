import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PasswordVerifier, ValidationError, AuthenticationError } from './password-verifier';
import { createClient } from '@supabase/supabase-js';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue({
    auth: {
      signInWithPassword: vi.fn(),
    }
  })
}));

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    auth: {
      admin: {
        signOut: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    }
  }
}));

describe('PasswordVerifier', () => {
  const mockCreateClient = vi.mocked(createClient);
  const mockSignIn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    
    // Default mock behavior
    mockSignIn.mockResolvedValue({ 
      data: { session: { access_token: 'valid-token' } }, 
      error: null 
    });
    mockCreateClient.mockReturnValue({
      auth: {
        signInWithPassword: mockSignIn,
      }
    } as any);
  });

  describe('initialization', () => {
    it('uses service role key and url from environment', async () => {
      const verifier = new PasswordVerifier();
      await verifier.verify('user@example.com', 'password123', null);
      
      expect(mockCreateClient).toHaveBeenCalledWith(
        'http://localhost:54321',
        'service-role-key',
        expect.any(Object)
      );
    });

    it('throws error if env vars are missing', () => {
      delete process.env.SUPABASE_URL;
      expect(() => new PasswordVerifier()).toThrow('Missing Supabase server env');
    });
  });

  describe('verify', () => {
    it('returns successfully for valid credentials', async () => {
      const verifier = new PasswordVerifier();
      await expect(verifier.verify('user@example.com', 'password123', null)).resolves.not.toThrow();
    });

    it('includes specific error message from Supabase', async () => {
      mockSignIn.mockResolvedValue({
        data: { session: null },
        error: { code: 'some_other_error', message: 'Specific Supabase Error' }
      });

      const verifier = new PasswordVerifier();
      await expect(verifier.verify('user@example.com', 'password123', null))
        .rejects.toThrow('Specific Supabase Error');
    });

    it('throws AuthenticationError for invalid credentials', async () => {
      mockSignIn.mockResolvedValue({
        data: { session: null },
        error: { code: 'invalid_credentials', message: 'Invalid login credentials' }
      });

      const verifier = new PasswordVerifier();
      const promise = verifier.verify('user@example.com', 'password123', null);
      
      await expect(promise).rejects.toThrow(AuthenticationError);
      await expect(promise).rejects.toThrow('Invalid credentials');
    });
  });

  describe('input validation', () => {
    it('rejects empty email', async () => {
      const verifier = new PasswordVerifier();
      await expect(verifier.verify('', 'password123', null)).rejects.toThrow(ValidationError);
    });

    it('rejects invalid email format', async () => {
      const verifier = new PasswordVerifier();
      await expect(verifier.verify('not-an-email', 'password123', null)).rejects.toThrow(ValidationError);
    });

    it('rejects empty password', async () => {
      const verifier = new PasswordVerifier();
      await expect(verifier.verify('user@example.com', '', null)).rejects.toThrow(ValidationError);
    });

    it('rejects password shorter than 8 characters', async () => {
      const verifier = new PasswordVerifier();
      await expect(verifier.verify('user@example.com', 'short', null)).rejects.toThrow(ValidationError);
    });

    it('rejects empty captcha token when provided', async () => {
      const verifier = new PasswordVerifier();
      await expect(verifier.verify('user@example.com', 'password123', '   ')).rejects.toThrow(ValidationError);
    });

    it('rejects captcha token that is too short', async () => {
      const verifier = new PasswordVerifier();
      await expect(verifier.verify('user@example.com', 'password123', 'short')).rejects.toThrow(ValidationError);
    });
  });
});

