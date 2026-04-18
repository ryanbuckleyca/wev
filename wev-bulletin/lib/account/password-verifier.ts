import 'server-only';

import { createClient as createServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { PasswordSchema } from '@/lib/schemas/account';

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
  constructor() {}

  /**
   * Verify a user's password using a database RPC.
   * This bypasses GoTrue's CAPTCHA and rate limiting for logins.
   * 
   * @throws {ValidationError} If inputs are invalid
   * @throws {AuthenticationError} If verification fails
   */
  async verify(password: string): Promise<void> {
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

    if (status === 'no_password') {
      throw new AuthenticationError(
        'This account uses a social login and does not have a password.',
        'NO_PASSWORD_SET'
      );
    }

    // Now that we know the account has a password, we validate the input format.
    // This allows differentiate between "you need a password" and "your password is too short".
    this.validateInputs(password);

    if (status === 'mismatch') {
      throw new AuthenticationError('Invalid credentials', 'INVALID_CREDENTIALS');
    }
  }

  /**
   * Validate password before attempting RPC.
   */
  private validateInputs(password: string): void {
    const result = PasswordSchema.safeParse(password);
    
    if (!result.success) {
      const issue = result.error.issues[0];
      const code = password ? 'PASSWORD_TOO_SHORT' : 'PASSWORD_REQUIRED';
      throw new ValidationError(issue.message, code);
    }
  }
}



