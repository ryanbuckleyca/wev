import type { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { forbiddenResponse, unauthorizedResponse } from '@/lib/http-errors';
import { logger } from '@/lib/logger';
import { fetchUserRolesFromService } from './server-user-roles';
import { rolesIncludeAdmin } from './user-roles';

export type AdminSessionResult =
  | { ok: true; user: User }
  | { ok: false; response: NextResponse };

/**
 * Ensures the request has a logged-in Supabase session whose user has the `admin` role
 * in `user_roles` (service-role read). Use on mutating or expensive admin-only routes.
 */
export async function requireAdminSession(): Promise<AdminSessionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, response: unauthorizedResponse() };
  }

  const loaded = await fetchUserRolesFromService(user.id);
  if (!loaded.ok) {
    logger.error({ err: loaded.error, userId: user.id }, 'user_roles load failed');
    return { ok: false, response: forbiddenResponse() };
  }

  if (!rolesIncludeAdmin(loaded.roles)) {
    return { ok: false, response: forbiddenResponse() };
  }

  return { ok: true, user };
}

/**
 * Convenience for route handlers that only need to block non-admins (no `user` payload).
 * Returns a `NextResponse` to return as-is, or `null` when the caller is an admin.
 */
export async function requireAdminResponse(): Promise<NextResponse | null> {
  const result = await requireAdminSession();
  return result.ok ? null : result.response;
}
