import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseAuthCookieName } from '@/lib/supabase/auth-cookie';

/** True when the request carries a Supabase auth cookie (chunked or single). */
export function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => isSupabaseAuthCookieName(cookie.name));
}

/**
 * Cache headers required when auth cookies are written, so CDNs never store a
 * session-bearing response. Matches the values `@supabase/ssr` ≥0.10 passes into
 * `setAll`; 0.8.0 does not supply them, so we set them explicitly.
 */
const AUTH_RESPONSE_CACHE_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  Expires: '0',
  Pragma: 'no-cache',
};

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refreshes the Supabase session via JWT claims when a session cookie is present.
 * Anonymous requests (no auth cookie) return immediately so public HTML can stay CDN-cacheable.
 */
export async function updateSession(request: NextRequest, initialResponse?: NextResponse) {
  // Start from the provided base response (e.g. from next-intl middleware) so
  // any rewrites or locale headers it set are preserved on the final response.
  let supabaseResponse = initialResponse ?? NextResponse.next({ request });

  // No session cookie: skip Auth entirely (no Set-Cookie / private Cache-Control).
  // Public paths with a session cookie still refresh so tokens stay valid.
  if (!hasSupabaseAuthCookie(request)) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // @supabase/ssr 0.8.0 SetAllCookies is cookies-only (no headers arg).
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // Build a fresh response so cookies can be written, but carry over
          // any headers (including x-middleware-rewrite, x-next-intl-locale,
          // etc.) from the base response so those mutations aren't lost.
          const newResponse = NextResponse.next({ request });
          initialResponse?.headers.forEach((value, key) => {
            newResponse.headers.set(key, value);
          });
          for (const [key, value] of Object.entries(AUTH_RESPONSE_CACHE_HEADERS)) {
            newResponse.headers.set(key, value);
          }
          supabaseResponse = newResponse;
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Local JWT verification (JWKS) instead of a network getUser() round-trip.
  // Still refreshes the session when the access token is near expiry.
  const { error } = await supabase.auth.getClaims();

  // After `supabase db reset`, the browser still holds old refresh tokens that
  // no longer exist. Drop the local session so we stop retrying every request.
  if (error?.code === 'refresh_token_not_found') {
    await supabase.auth.signOut({ scope: 'local' });
  }

  return supabaseResponse;
}
