import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function getRedirectBase(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/$/, '')
  const { origin } = new URL(request.url)
  return origin
}

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const base = getRedirectBase(request)
  return NextResponse.redirect(`${base}/login`, { status: 302 })
}
