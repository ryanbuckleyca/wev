import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseAuthCookieName } from '@/lib/supabase/auth-cookie';

/** True when the request carries a Supabase auth cookie (chunked or single). */
export function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => isSupabaseAuthCookieName(cookie.name));
}

/**
 * Paths that serve the same anonymous HTML for everyone.
 * Skip session refresh here so Cloudflare/CDN can cache and we avoid an
 * Auth round-trip on every public hit. Protected routes and /api still refresh.
 */
export function isPublicCacheablePath(pathname: string): boolean {
  if (pathname.startsWith('/api')) return false;

  const stripped = pathname.replace(/^\/(en|fr)(?=\/|$)/, '') || '/';

  if (stripped === '/' || stripped === '/jobs' || stripped === '/emplois') return true;
  if (stripped.startsWith('/organizations')) return true;
  if (
    stripped === '/login' ||
    stripped === '/signup' ||
    stripped === '/forgot-password' ||
    stripped === '/reset-password' ||
    stripped === '/style-guide'
  ) {
    return true;
  }

  return false;
}

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Refreshes the Supabase session via JWT claims when a session cookie is present on protected routes. */
export async function updateSession(request: NextRequest, initialResponse?: NextResponse) {
  // Start from the provided base response (e.g. from next-intl middleware) so
  // any rewrites or locale headers it set are preserved on the final response.
  let supabaseResponse = initialResponse ?? NextResponse.next({ request });

  // Anonymous traffic, or public pages that should stay CDN-cacheable:
  // skip Auth so we never attach Set-Cookie / private Cache-Control.
  // Protected routes and /api still refresh via getClaims() when a session exists.
  if (!hasSupabaseAuthCookie(request) || isPublicCacheablePath(request.nextUrl.pathname)) {
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
        // Newer @supabase/ssr docs pass CDN-busting headers as a 2nd arg after refresh.
        setAll(cookiesToSet: CookieToSet[], headers?: Record<string, string>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // Build a fresh response so cookies can be written, but carry over
          // any headers (including x-middleware-rewrite, x-next-intl-locale,
          // etc.) from the base response so those mutations aren't lost.
          const newResponse = NextResponse.next({ request });
          initialResponse?.headers.forEach((value, key) => {
            newResponse.headers.set(key, value);
          });
          if (headers) {
            for (const [key, value] of Object.entries(headers)) {
              if (typeof value === 'string') newResponse.headers.set(key, value);
            }
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
