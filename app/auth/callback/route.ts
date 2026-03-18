import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Base URL for redirects. Use configured value to avoid localhost when request.url has wrong host (e.g. internal proxy). */
function getRedirectBase(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/$/, '')
  const { origin } = new URL(request.url)
  return origin
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  // "next" param allows redirecting to a specific page after login
  const next = searchParams.get('next') ?? '/'
  const base = getRedirectBase(request)

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${base}${next}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${base}/auth/auth-code-error`)
}
