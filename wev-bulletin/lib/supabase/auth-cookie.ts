/** True for Supabase auth token cookie names (single or chunked). */
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
