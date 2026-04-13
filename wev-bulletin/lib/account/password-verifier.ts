import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase-server';
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

const MIN_PASSWORD_LENGTH = 8;
const MIN_CAPTCHA_TOKEN_LENGTH = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Verifies user passwords by creating a temporary session and immediately revoking it.
 * Used for sensitive operations like account deletion and password changes.
 */
export class PasswordVerifier {
  private readonly supabaseUrl: string;
  private readonly publishableKey: string;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('Missing Supabase server env for password verification');
    }

    this.supabaseUrl = url;
    this.publishableKey = key;
  }

  /**
   * Verify a user's password with optional captcha token.
   * Creates a temporary session and immediately revokes it.
   * 
   * @throws {ValidationError} If inputs are invalid
   * @throws {AuthenticationError} If authentication fails
   */
  async verify(email: string, password: string, captchaToken: string | null): Promise<void> {
    this.validateInputs(email, password, captchaToken);

    const session = await this.createVerificationSession(email, password, captchaToken);

    try {
      await this.revokeSession(session.accessToken);
    } catch (error) {
      // Log but don't throw - verification succeeded, cleanup failed
      logger.error({
        msg: 'Failed to revoke verification session',
        error,
        email,
        hasToken: !!session.accessToken,
      });
    }
  }

  /**
   * Validate all inputs before attempting authentication.
   */
  private validateInputs(email: string, password: string, captchaToken: string | null): void {
    if (!email?.trim()) {
      throw new ValidationError('Email is required', 'EMAIL_REQUIRED');
    }

    if (!this.isValidEmail(email)) {
      throw new ValidationError('Invalid email format', 'EMAIL_INVALID');
    }

    if (!password) {
      throw new ValidationError('Password is required', 'PASSWORD_REQUIRED');
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        'PASSWORD_TOO_SHORT'
      );
    }

    if (captchaToken !== null) {
      const trimmed = captchaToken.trim();
      if (trimmed.length === 0) {
        throw new ValidationError('Captcha token cannot be empty', 'CAPTCHA_EMPTY');
      }
      if (trimmed.length < MIN_CAPTCHA_TOKEN_LENGTH) {
        throw new ValidationError('Invalid captcha token', 'CAPTCHA_INVALID');
      }
    }
  }

  /**
   * Check if email format is valid.
   */
  private isValidEmail(email: string): boolean {
    return EMAIL_PATTERN.test(email.trim());
  }

  /**
   * Create a temporary session for password verification.
   */
  private async createVerificationSession(
    email: string,
    password: string,
    captchaToken: string | null
  ): Promise<{ accessToken: string }> {
    const client = this.createClient();

    const signInPayload: {
      email: string;
      password: string;
      options?: { captchaToken?: string };
    } = {
      email: email.trim(),
      password,
    };

    // Only include captcha if provided and non-empty
    if (captchaToken && captchaToken.trim()) {
      signInPayload.options = { captchaToken: captchaToken.trim() };
    }

    const { data, error } = await client.auth.signInWithPassword(signInPayload);

    if (error) {
      if (error.code === 'invalid_credentials') {
        throw new AuthenticationError('Invalid credentials', 'INVALID_CREDENTIALS');
      }

      if (error.code === 'email_not_confirmed') {
        throw new AuthenticationError('Email not confirmed', 'EMAIL_NOT_CONFIRMED');
      }

      logger.warn({
        msg: 'Password verification failed',
        code: error.code,
        status: error.status,
        message: error.message,
      });

      throw new AuthenticationError(
        error.message || 'Authentication failed',
        error.code ?? 'AUTH_FAILED',
        error
      );
    }


    if (!data.session?.access_token) {
      throw new AuthenticationError(
        'No session returned from authentication',
        'NO_SESSION'
      );
    }

    return { accessToken: data.session.access_token };
  }

  /**
   * Revoke a session token.
   */
  private async revokeSession(accessToken: string): Promise<void> {
    const adminSupabase = supabaseServer;
    const { error } = await adminSupabase.auth.admin.signOut(accessToken, 'local');

    if (error) {
      throw error;
    }
  }

  /**
   * Create a Supabase client for password verification.
   */
  private createClient() {
    return createSupabaseClient(this.supabaseUrl, this.publishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }
}
