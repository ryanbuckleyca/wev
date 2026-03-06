import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest, initialResponse?: NextResponse) {
  // Start from the provided base response (e.g. from next-intl middleware) so
  // any rewrites or locale headers it set are preserved on the final response.
  let supabaseResponse = initialResponse ?? NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Build a fresh response so cookies can be written, but carry over
          // any headers (including x-middleware-rewrite, x-next-intl-locale,
          // etc.) from the base response so those mutations aren't lost.
          const newResponse = NextResponse.next({ request })
          initialResponse?.headers.forEach((value, key) => {
            newResponse.headers.set(key, value)
          })
          supabaseResponse = newResponse
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: DO NOT REMOVE auth.getUser()
  // Refreshes the auth token and ensures cookies stay in sync.
  await supabase.auth.getUser()

  return supabaseResponse
}
