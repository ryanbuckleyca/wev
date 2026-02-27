'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

export type UserRole = 'admin' | 'moderator' | 'user'

interface AuthContextValue {
  user: User | null
  role: UserRole
  roles: string[]
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: 'user',
  roles: ['user'],
  loading: true,
})

function normalizeRoles(roles: string[]): string[] {
  const cleaned = roles
    .map((role) => role.trim())
    .filter((role) => role.length > 0)

  if (cleaned.length === 0) {
    return ['user']
  }

  return Array.from(new Set(cleaned))
}

function deriveRole(roles: string[]): UserRole {
  const normalized = normalizeRoles(roles).map((role) => role.toLowerCase())
  if (normalized.includes('admin')) return 'admin'
  if (normalized.includes('moderator')) return 'moderator'
  return 'user'
}

function extractRolesFromUser(user: User | null): string[] {
  if (!user) return ['user']

  const appMeta = user.app_metadata as Record<string, unknown> | undefined
  const userMeta = user.user_metadata as Record<string, unknown> | undefined

  const roleCandidates = [
    appMeta?.roles,
    appMeta?.role,
    userMeta?.roles,
    userMeta?.role,
  ]

  for (const candidate of roleCandidates) {
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

async function fetchRolesForUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  fallbackRoles: string[]
): Promise<string[]> {
  try {
    const response = await fetch('/api/auth/roles', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'cache-control': 'no-store',
      },
    })

    if (response.ok) {
      const payload = await response.json()
      if (payload && Array.isArray(payload.roles)) {
        return normalizeRoles(payload.roles.filter((role: unknown): role is string => typeof role === 'string'))
      }
    }
  } catch {
    // Fall back to direct browser query.
  }

  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('roles')
      .eq('user_id', userId)
      .maybeSingle()

    if (!error && data && Array.isArray(data.roles)) {
      return normalizeRoles(data.roles.filter((role): role is string => typeof role === 'string'))
    }
  } catch {
    // Keep fallback roles when direct query fails.
  }

  return normalizeRoles(fallbackRoles)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [roles, setRoles] = useState<string[]>(['user'])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let mounted = true
    const loadAuthState = async () => {
      try {
        let resolvedUser: User | null = null

        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (session?.user) {
          resolvedUser = session.user
        } else {
          const {
            data: { user: currentUser },
          } = await supabase.auth.getUser()
          resolvedUser = currentUser ?? null
        }

        if (!mounted) return

        setUser(resolvedUser)
        const fallbackRoles = extractRolesFromUser(resolvedUser)
        setRoles(fallbackRoles)

        if (resolvedUser) {
          const resolvedRoles = await fetchRolesForUser(supabase, resolvedUser.id, fallbackRoles)
          if (!mounted) return
          setRoles(resolvedRoles)
        }
      } catch {
        if (!mounted) return
        setUser(null)
        setRoles(['user'])
      } finally {
        if (!mounted) return
        setLoading(false)
      }
    }

    loadAuthState()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return

      const nextUser = session?.user ?? null
      setUser(nextUser)
      const fallbackRoles = extractRolesFromUser(nextUser)
      setRoles(fallbackRoles)

      if (nextUser) {
        const resolvedRoles = await fetchRolesForUser(supabase, nextUser.id, fallbackRoles)
        if (!mounted) return
        setRoles(resolvedRoles)
      }

      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabase])

  const value = useMemo<AuthContextValue>(() => {
    return {
      user,
      role: deriveRole(roles),
      roles,
      loading,
    }
  }, [user, roles, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
