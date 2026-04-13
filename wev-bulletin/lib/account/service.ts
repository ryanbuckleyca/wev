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
      // If user has no password (OAuth), we allow them to proceed for certain actions
      // in the caller, but here we just pass the error up if it's a mismatch.
      if (error.code === 'NO_PASSWORD_SET') {
        throw error;
      }

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

  try {
    await verifyPassword(currentPassword, 'Current password is incorrect.');
  } catch (error) {
    // If user has no password, they can set one for the first time without currentPassword
    if (error instanceof AuthenticationError && error.code === 'NO_PASSWORD_SET') {
      // Proceed (setting initial password)
    } else {
      throw error;
    }
  }

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
  userId: string;
}) {
  if (!password?.trim()) {
    throw new AccountServiceError(
      'Password required for account deletion',
      400,
      'PASSWORD_REQUIRED'
    );
  }

  try {
    await verifyPassword(password, 'Invalid password');
  } catch (error) {
    // For OAuth users who don't have a password, we allow deletion as long as they are authenticated.
    // This matches the approved plan to handle social login users.
    if (error instanceof AuthenticationError && error.code === 'NO_PASSWORD_SET') {
      // Proceed with deletion
    } else {
      throw error;
    }
  }

  const adminSupabase = supabaseServer;
  const { error } = await adminSupabase.auth.admin.deleteUser(userId);

  if (error) {
    throw error;
  }
}

