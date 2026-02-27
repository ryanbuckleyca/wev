import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = {
  'cache-control': 'no-store, max-age=0, must-revalidate',
}

function parseRolesColumn(roles: unknown): string[] {
  if (Array.isArray(roles)) {
    const parsed = roles
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)

    if (parsed.length > 0) {
      return Array.from(new Set(parsed))
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

    try {
      const adminClient = getSupabaseServer()
      const { data, error } = await adminClient
        .from('user_roles')
        .select('roles')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) {
        return NextResponse.json({ roles: ['user'] }, { headers: NO_STORE_HEADERS })
      }

      const roles = parseRolesColumn((data as { roles?: unknown } | null)?.roles)
      return NextResponse.json({ roles }, { headers: NO_STORE_HEADERS })
    } catch {
      return NextResponse.json({ roles: ['user'] }, { headers: NO_STORE_HEADERS })
    }
  } catch {
    return NextResponse.json({ roles: ['user'] }, { status: 500, headers: NO_STORE_HEADERS })
  }
}
