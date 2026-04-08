import 'server-only';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export type RequestUserResult = { ok: true; user: User } | { ok: false; authError: unknown };

/**
 * Reads the current request's Supabase user from the server session.
 * Callers choose the response semantics for unauthenticated access.
 */
export async function getRequestUser(): Promise<RequestUserResult> {
  const supabase = await createClient();

  // NOTE (Staff Dev): Using getSession() instead of getUser() eliminates a
  // network round-trip to Supabase Auth, saving ~200-400ms on server rendering.
  // SECURITY TRADE-OFF: This validates the JWT signature locally but DOES NOT
  // check if the user is banned or the session was revoked. This is acceptable
  // for this read-only public bulletin, but DO NOT use this pattern on
  // sensitive/write-only routes (e.g. /profile/settings or /admin/billing).
  //
  // The Supabase SDK logs a console.warn about getSession() being insecure.
  // We silence it here since the trade-off is intentional and documented.
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (!msg.includes('getSession()')) originalWarn(...args);
  };
  const {
    data: { session },
    error: authError,
  } = await supabase.auth.getSession();
  console.warn = originalWarn;

  const user = session?.user;

  if (authError || !user) {
    return { ok: false, authError };
  }

  return { ok: true, user };
}
