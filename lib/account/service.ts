import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getSupabaseServer } from '@/lib/supabase-server';

export class AccountServiceError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'AccountServiceError';
  }
}

function getPasswordVerificationClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error('Missing Supabase public env for password verification');
  }

  return createSupabaseClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function requirePasswordVerificationEmail(userEmail?: string | null): string {
  if (!userEmail) {
    throw new AccountServiceError('Password verification is not available for this account.');
  }

  return userEmail;
}

async function assertPasswordVerified(
  userEmail: string,
  password: string,
  invalidPasswordMessage: string,
) {
  const verifier = getPasswordVerificationClient();
  const { error } = await verifier.auth.signInWithPassword({
    email: userEmail,
    password,
  });

  if (error) {
    throw new AccountServiceError(invalidPasswordMessage);
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
  if (!currentPassword.trim()) {
    throw new AccountServiceError('Current password is required.');
  }

  if (!newPassword) {
    throw new AccountServiceError('New password is required.');
  }

  const email = requirePasswordVerificationEmail(userEmail);
  await assertPasswordVerified(email, currentPassword, 'Current password is incorrect.');

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
  if (!password.trim()) {
    throw new AccountServiceError('Password required for account deletion');
  }

  const email = requirePasswordVerificationEmail(userEmail);
  await assertPasswordVerified(email, password, 'Invalid password');

  const adminSupabase = getSupabaseServer();
  const { error } = await adminSupabase.auth.admin.deleteUser(userId);

  if (error) {
    throw error;
  }
}
