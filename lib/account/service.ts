import 'server-only';

import { createClient as createServerClient } from '@/lib/supabase/server';
import { supabaseServer } from '@/lib/supabase-server';
import { PasswordVerifier, ValidationError, AuthenticationError } from './password-verifier';

export class AccountServiceError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'AccountServiceError';
  }
}

function requirePasswordVerificationEmail(userEmail?: string | null): string {
  if (!userEmail) {
    throw new AccountServiceError(
      'Password verification is not available for this account.',
      400,
      'EMAIL_REQUIRED'
    );
  }

  return userEmail;
}

async function verifyPassword(
  userEmail: string,
  password: string,
  captchaToken: string | null,
  errorMessage: string,
): Promise<void> {
  const verifier = new PasswordVerifier();

  try {
    await verifier.verify(userEmail, password, captchaToken);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new AccountServiceError(error.message, 400, error.code);
    }

    if (error instanceof AuthenticationError) {
      // Use custom error message for invalid credentials
      if (error.code === 'INVALID_CREDENTIALS') {
        throw new AccountServiceError(errorMessage, 401, error.code);
      }
      throw new AccountServiceError(error.message, 401, error.code);
    }

    throw error;
  }
}

export async function updatePasswordForCurrentUser({
  currentPassword,
  newPassword,
  userEmail,
}: {
  currentPassword: string;
  newPassword: string;
  userEmail?: string | null;
}) {
  if (!currentPassword?.trim()) {
    throw new AccountServiceError('Current password is required.', 400, 'PASSWORD_REQUIRED');
  }

  if (!newPassword?.trim()) {
    throw new AccountServiceError('New password is required.', 400, 'NEW_PASSWORD_REQUIRED');
  }

  if (newPassword.length < 8) {
    throw new AccountServiceError(
      'New password must be at least 8 characters.',
      400,
      'PASSWORD_TOO_SHORT'
    );
  }

  const email = requirePasswordVerificationEmail(userEmail);
  // Password change: use test captcha token if in test mode, otherwise null
  const captchaToken = process.env.NEXT_PUBLIC_ENV_MODE === 'test' 
    ? 'XXXX.DUMMY.TOKEN.XXXX' 
    : null;
  await verifyPassword(email, currentPassword, captchaToken, 'Current password is incorrect.');

  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    throw error;
  }
}

export async function deleteAccountForCurrentUser({
  password,
  userEmail,
  userId,
}: {
  password: string;
  userEmail?: string | null;
  userId: string;
}) {
  if (!password?.trim()) {
    throw new AccountServiceError(
      'Password required for account deletion',
      400,
      'PASSWORD_REQUIRED'
    );
  }

  const email = requirePasswordVerificationEmail(userEmail);
  // Account deletion doesn't require captcha - user is already authenticated
  const captchaToken = process.env.NEXT_PUBLIC_ENV_MODE === 'test' 
    ? 'XXXX.DUMMY.TOKEN.XXXX' 
    : null;
  await verifyPassword(email, password, captchaToken, 'Invalid password');

  const adminSupabase = supabaseServer;
  const { error } = await adminSupabase.auth.admin.deleteUser(userId);

  if (error) {
    throw error;
  }
}
