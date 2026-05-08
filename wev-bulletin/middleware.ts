import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const i18nMiddleware = createMiddleware(routing);

export async function middleware(request: NextRequest) {
  // Skip i18n for API routes – they live at /api/... without a locale prefix.
  // Still run Supabase session refresh so auth cookies stay valid.
  if (request.nextUrl.pathname.startsWith('/api')) {
    return await updateSession(request);
  }

  // Run i18n middleware first to get any redirect or rewrite/locale headers
  const i18nResponse = i18nMiddleware(request);

  // If next-intl returned a redirect, honour it immediately
  if (i18nResponse.status >= 300 && i18nResponse.status < 400) {
    return i18nResponse;
  }

  // Pass the i18n response as the base so rewrites and locale headers
  // (e.g. x-next-intl-locale, x-middleware-rewrite) are preserved on the
  // final response alongside the Supabase session cookies.
  return await updateSession(request, i18nResponse);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - auth (auth callback / sign-out routes handled separately)
     * - _next/static (static files)
     * - _next/image (image optimisation files)
     * - favicon.ico
     * - static asset extensions
     *
     * /api IS intentionally included so Supabase session cookies are
     * refreshed for API routes (avoids 401s after token expiry).
     */
    '/((?!auth|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|json)$).*)',
  ],
};
