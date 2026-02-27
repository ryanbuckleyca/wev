import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = {
  'cache-control': 'no-store, max-age=0, must-revalidate',
}

function extractRolesFromUserMetadata(user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }) {
  const appMeta = user.app_metadata ?? {}
  const userMeta = user.user_metadata ?? {}
  const candidates = [appMeta.roles, appMeta.role, userMeta.roles, userMeta.role]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const roles = candidate.filter((r): r is string => typeof r === 'string' && r.length > 0)
      if (roles.length > 0) return roles
    }
    if (typeof candidate === 'string' && candidate.length > 0) {
      return [candidate]
    }
  }

  return ['user']
}

export async function GET() {
  try {
    const supabase = createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ roles: ['user'] }, { status: 401, headers: NO_STORE_HEADERS })
    }

    let roles = extractRolesFromUserMetadata(user)

    try {
      const adminClient = getSupabaseServer()
      const { data, error } = await adminClient
        .from('user_roles')
        .select('roles')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!error && data && Array.isArray(data.roles) && data.roles.length > 0) {
        roles = data.roles.filter((r): r is string => typeof r === 'string' && r.length > 0)
      }
    } catch {
      // Keep metadata-derived roles when server-role client is unavailable.
    }

    return NextResponse.json({ roles }, { headers: NO_STORE_HEADERS })
  } catch {
    return NextResponse.json({ roles: ['user'] }, { status: 500, headers: NO_STORE_HEADERS })
  }
}
