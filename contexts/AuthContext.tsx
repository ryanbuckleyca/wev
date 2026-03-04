'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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

  const rolesPromise = async () => {
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

  // Perform the role fetch; callers will set a fast default and update when this resolves.
  return rolesPromise()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [roles, setRoles] = useState<string[]>(['user'])
  const [loading, setLoading] = useState(true)
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const userIdRef = useRef<string | null>(null)
  const rolesResolvedForRef = useRef<string | null>(null)

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

        userIdRef.current = resolvedUser?.id ?? null
        setUser(resolvedUser)
        setRoles(['user'])
        setLoading(false)

        if (resolvedUser) {
          fetchRolesForUser(supabase, resolvedUser.id)
            .then((resolvedRoles) => {
              if (!mounted) return
              rolesResolvedForRef.current = resolvedUser!.id
              setRoles(resolvedRoles)
            })
            .catch(() => {
              if (!mounted) return
              setRoles(['user'])
            })
        }
      } catch {
        if (!mounted) return
        userIdRef.current = null
        rolesResolvedForRef.current = null
        setUser(null)
        setRoles(['user'])
        setLoading(false)
      }
    }

    loadAuthState()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      const nextUser = session?.user ?? null
      const userChanged = nextUser?.id !== userIdRef.current

      userIdRef.current = nextUser?.id ?? null
      setUser(nextUser)
      setLoading(false)

      if (!nextUser) {
        rolesResolvedForRef.current = null
        setRoles(['user'])
      } else if (userChanged) {
        rolesResolvedForRef.current = null
        setRoles(['user'])
        fetchRolesForUser(supabase, nextUser.id)
          .then((resolvedRoles) => {
            if (!mounted) return
            rolesResolvedForRef.current = nextUser.id
            setRoles(resolvedRoles)
          })
          .catch(() => {
            if (!mounted) return
            setRoles(['user'])
          })
      } else if (event === 'TOKEN_REFRESHED' && rolesResolvedForRef.current === nextUser.id) {
        // Same user, token just refreshed (e.g. tab switch) — roles haven't changed,
        // skip refetch to avoid a transient downgrade if the API races the refresh.
      } else if (rolesResolvedForRef.current !== nextUser.id) {
        fetchRolesForUser(supabase, nextUser.id)
          .then((resolvedRoles) => {
            if (!mounted) return
            rolesResolvedForRef.current = nextUser.id
            setRoles(resolvedRoles)
          })
          .catch(() => {
            if (!mounted) return
          })
      }
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
