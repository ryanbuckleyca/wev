import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { supabaseServer } from '@/lib/supabase-server';

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

function getAuthErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

async function assertPasswordVerified(
  userEmail: string,
  password: string,
  captchaToken: string | null,
  invalidPasswordMessage: string,
) {
  const verifier = getPasswordVerificationClient();
  const signInPayload: {
    email: string;
    password: string;
    options?: { captchaToken: string };
  } = {
    email: userEmail,
    password,
  };
  if (captchaToken?.trim()) {
    signInPayload.options = { captchaToken: captchaToken.trim() };
  }

  const { data, error } = await verifier.auth.signInWithPassword(signInPayload);

  if (error) {
    if (getAuthErrorCode(error) === 'invalid_credentials') {
      throw new AccountServiceError(invalidPasswordMessage);
    }

    throw error;
  }

  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error('Password verification did not return a session token.');
  }

  const adminSupabase = supabaseServer;
  const { error: revokeError } = await adminSupabase.auth.admin.signOut(accessToken, 'local');

  if (revokeError) {
    throw revokeError;
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
  await assertPasswordVerified(email, currentPassword, null, 'Current password is incorrect.');

  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    throw error;
  }
}

export async function deleteAccountForCurrentUser({
  password,
  captchaToken,
  userEmail,
  userId,
}: {
  password: string;
  captchaToken: string;
  userEmail?: string | null;
  userId: string;
}) {
  if (!password.trim()) {
    throw new AccountServiceError('Password required for account deletion');
  }
  if (!captchaToken.trim()) {
    throw new AccountServiceError('Please complete the CAPTCHA verification.');
  }

  const email = requirePasswordVerificationEmail(userEmail);
  await assertPasswordVerified(email, password, captchaToken, 'Invalid password');

  const adminSupabase = supabaseServer;
  const { error } = await adminSupabase.auth.admin.deleteUser(userId);

  if (error) {
    throw error;
  }
}
