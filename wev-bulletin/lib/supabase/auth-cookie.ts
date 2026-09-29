/**
 * Shared Supabase auth-cookie name check (chunked or single token cookie).
 * Used by middleware and the browser so session detection stays consistent.
 */
export function isSupabaseAuthCookieName(name: string): boolean {
  return name.startsWith('sb-') && name.includes('auth-token');
}

/** True when `document.cookie` includes a Supabase auth token cookie. */
export function hasSupabaseAuthCookieInBrowser(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some((part) => {
    const name = part.split('=')[0]?.trim() ?? '';
    return isSupabaseAuthCookieName(name);
  });
}
