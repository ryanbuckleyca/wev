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

function parseRolesColumn(roles: unknown): string[] {
  if (Array.isArray(roles)) {
    const parsed = roles
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)

    if (parsed.length > 0) {
      return normalizeRoles(parsed)
    }
  }

  return ['user']
}

async function fetchRolesForUser(
  supabase: ReturnType<typeof createClient>,
  userId: string
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
        return normalizeRoles(payload.roles.filter((role: unknown): role is string => typeof role === 'string' && role.length > 0))
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

    if (!error) {
      return parseRolesColumn((data as { roles?: unknown } | null)?.roles)
    }
  } catch {
    // Keep default role when direct query fails.
  }

  return ['user']
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
        setRoles(['user'])

        if (resolvedUser) {
          const resolvedRoles = await fetchRolesForUser(supabase, resolvedUser.id)
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
      setRoles(['user'])

      if (nextUser) {
        const resolvedRoles = await fetchRolesForUser(supabase, nextUser.id)
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
