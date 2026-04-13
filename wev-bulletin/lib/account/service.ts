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
  password: string,
  errorMessage: string,
): Promise<void> {
  const verifier = new PasswordVerifier();

  try {
    await verifier.verify(password);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new AccountServiceError(error.message, 400, error.code);
    }

    if (error instanceof AuthenticationError) {
      const message = error.code === 'INVALID_CREDENTIALS' ? errorMessage : error.message;
      throw new AccountServiceError(message, 401, error.code);
    }

    throw error;
  }
}

export async function updatePasswordForCurrentUser({
  currentPassword,
  newPassword,
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

  if (newPassword.length < PasswordVerifier.MIN_PASSWORD_LENGTH) {
    throw new AccountServiceError(
      `New password must be at least ${PasswordVerifier.MIN_PASSWORD_LENGTH} characters.`,
      400,
      'PASSWORD_TOO_SHORT'
    );
  }

  await verifyPassword(currentPassword, 'Current password is incorrect.');

  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    throw error;
  }
}

export async function deleteAccountForCurrentUser({
  password,
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

  await verifyPassword(password, 'Invalid password');

  const adminSupabase = supabaseServer;
  const { error } = await adminSupabase.auth.admin.deleteUser(userId);

  if (error) {
    throw error;
  }
}

