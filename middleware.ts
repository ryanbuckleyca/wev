import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

const i18nMiddleware = createMiddleware(routing)

export async function middleware(request: NextRequest) {
  // Handle locale detection and redirection first
  const i18nResponse = i18nMiddleware(request)
  
  // If next-intl middleware returned a redirect, return it immediately
  if (i18nResponse && i18nResponse.status >= 300 && i18nResponse.status < 400) {
    return i18nResponse
  }
  
  // Otherwise, continue with Supabase session update
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static files (svg, png, jpg, jpeg, gif, webp)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
