import 'server-only';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export type RequestUserResult =
  | { ok: true; user: User }
  | { ok: false; authError: unknown };

/**
 * Reads the current request's Supabase user from the server session.
 * Callers choose the response semantics for unauthenticated access.
 */
export async function getRequestUser(): Promise<RequestUserResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, authError };
  }

  return { ok: true, user };
}
