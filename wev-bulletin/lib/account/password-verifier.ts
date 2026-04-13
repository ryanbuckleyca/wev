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

export class PasswordVerifier {
  public static readonly MIN_PASSWORD_LENGTH = 8;
  public static readonly MIN_CAPTCHA_TOKEN_LENGTH = 10;
  public static readonly EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  private readonly supabaseUrl: string;
  private readonly serviceRoleKey: string;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('Missing Supabase server env for password verification');
    }

    this.supabaseUrl = url;
    this.serviceRoleKey = key;
  }

  /**
   * Verify a user's password with optional captcha token.
   * Creates a temporary session and immediately revokes it.
   * 
   * @throws {ValidationError} If inputs are invalid
   * @throws {AuthenticationError} If authentication fails
   */
  async verify(email: string, password: string, captchaToken: string | null): Promise<void> {
    const trimmedEmail = (email || '').trim();
    const trimmedCaptcha = captchaToken?.trim() || null;

    this.validateInputs(trimmedEmail, password, trimmedCaptcha);

    const session = await this.createVerificationSession(trimmedEmail, password, trimmedCaptcha);

    try {
      await this.revokeSession(session.accessToken);
    } catch (error) {
      // Log but don't throw - verification succeeded, cleanup failed
      logger.error({
        msg: 'Failed to revoke verification session',
        error,
        email: trimmedEmail,
        hasToken: !!session.accessToken,
      });
    }
  }

  /**
   * Validate all inputs before attempting authentication.
   */
  private validateInputs(email: string, password: string, captchaToken: string | null): void {
    if (!email) {
      throw new ValidationError('Email is required', 'EMAIL_REQUIRED');
    }

    if (!PasswordVerifier.EMAIL_PATTERN.test(email)) {
      throw new ValidationError('Invalid email format', 'EMAIL_INVALID');
    }

    if (!password) {
      throw new ValidationError('Password is required', 'PASSWORD_REQUIRED');
    }

    if (password.length < PasswordVerifier.MIN_PASSWORD_LENGTH) {
      throw new ValidationError(
        `Password must be at least ${PasswordVerifier.MIN_PASSWORD_LENGTH} characters`,
        'PASSWORD_TOO_SHORT'
      );
    }

    if (captchaToken !== null) {
      if (captchaToken.length === 0) {
        throw new ValidationError('Captcha token cannot be empty', 'CAPTCHA_EMPTY');
      }
      if (captchaToken.length < PasswordVerifier.MIN_CAPTCHA_TOKEN_LENGTH) {
        throw new ValidationError('Invalid captcha token', 'CAPTCHA_INVALID');
      }
    }
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
      email,
      password,
    };

    if (captchaToken) {
      signInPayload.options = { captchaToken };
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
    return createSupabaseClient(this.supabaseUrl, this.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }
}

