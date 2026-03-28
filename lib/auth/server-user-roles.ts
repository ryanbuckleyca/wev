import 'server-only';
import { getSupabaseServer } from '@/lib/supabase-server';
import { parseRolesColumn } from './user-roles';

/**
 * Loads `user_roles.roles` via the service client (bypasses RLS).
 * Never throws: failures become `{ ok: false }` so callers choose semantics:
 * - `GET /api/auth/roles`: fail-open → default `['user']`
 * - `requireAdminSession`: fail-closed → 403
 */
export async function fetchUserRolesFromService(userId: string): Promise<
  { ok: true; roles: string[] } | { ok: false; error: unknown }
> {
  try {
    const adminClient = getSupabaseServer();
    const { data, error } = await adminClient
      .from('user_roles')
      .select('roles')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return { ok: false, error };
    }

    const roles = parseRolesColumn((data as { roles?: unknown } | null)?.roles);
    return { ok: true, roles };
  } catch (error) {
    return { ok: false, error };
  }
}
