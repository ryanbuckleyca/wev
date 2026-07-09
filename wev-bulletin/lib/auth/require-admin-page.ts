import 'server-only';

import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { requireAdminSession } from './require-admin';

/**
 * Page-level admin gate. Unauthenticated users go to login; authenticated
 * non-admins are redirected to the locale home page.
 */
export async function requireAdminPage(locale: string): Promise<User> {
  const result = await requireAdminSession();
  if (result.ok) return result.user;

  if (result.response.status === 403) {
    redirect(`/${locale}`);
  }
  redirect(`/${locale}/login`);
}
