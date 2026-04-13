import 'server-only';

import { createClient as createServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export class ValidationError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string, readonly code: string, readonly cause?: unknown) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class PasswordVerifier {
  public static readonly MIN_PASSWORD_LENGTH = 8;
  public static readonly EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  constructor() {}

  /**
   * Verify a user's password using a database RPC.
   * This bypasses GoTrue's CAPTCHA and rate limiting for logins.
   * 
   * @throws {ValidationError} If inputs are invalid
   * @throws {AuthenticationError} If verification fails
   */
  async verify(password: string): Promise<void> {
    this.validateInputs(password);

    const supabase = await createServerClient();
    
    const { data: status, error } = await supabase.rpc('verify_user_password', { 
      password 
    });

    if (error) {
      logger.error({
        msg: 'Password verification RPC error',
        error,
      });

      throw new AuthenticationError(
        'Verification system error',
        'SYSTEM_ERROR',
        error
      );
    }

    if (status === 'mismatch') {
      throw new AuthenticationError('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    if (status === 'no_password') {
      throw new AuthenticationError(
        'This account uses a social login and does not have a password.',
        'NO_PASSWORD_SET'
      );
    }
  }

  /**
   * Validate password before attempting RPC.
   */
  private validateInputs(password: string): void {
    if (!password) {
      throw new ValidationError('Password is required', 'PASSWORD_REQUIRED');
    }

    if (password.length < PasswordVerifier.MIN_PASSWORD_LENGTH) {
      throw new ValidationError(
        `Password must be at least ${PasswordVerifier.MIN_PASSWORD_LENGTH} characters`,
        'PASSWORD_TOO_SHORT'
      );
    }
  }
}



