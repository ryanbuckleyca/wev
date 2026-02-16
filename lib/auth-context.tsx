'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { AuthAdapterImpl, AuthUser, UserRole } from '@/lib/auth'
import type { AuthAdapter } from '@/lib/auth'

// ── Singleton adapter instance (created once, shared everywhere) ──
const adapter: AuthAdapter = new AuthAdapterImpl()

// ── Context shape (provider-agnostic) ──
interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  isLoggedIn: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// ── Provider ──
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Initial session check
    const init = async () => {
      try {
        const session = await adapter.getSession()
        if (session?.accessToken) {
          // Extract user ID from the token
          const adapterImpl = adapter as AuthAdapterImpl
          const userId = adapterImpl.getUserIdFromToken(session.accessToken)
          if (userId) {
            const profile = await adapter.getUserProfile(userId)
            setUser(profile)
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error)
      } finally {
        setLoading(false)
      }
    }

    init()

    // Subscribe to auth state changes
    const unsubscribe = adapter.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        return
      }

      if (session?.accessToken) {
        try {
          const adapterImpl = adapter as AuthAdapterImpl
          const userId = adapterImpl.getUserIdFromToken(session.accessToken)
          if (userId) {
            const profile = await adapter.getUserProfile(userId)
            setUser(profile)
          }
        } catch (error) {
          console.error('Error fetching user profile:', error)
        }
      } else {
        setUser(null)
      }
    })

    return unsubscribe
  }, [])

  const handleSignOut = async () => {
    await adapter.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, isLoggedIn: !!user, signOut: handleSignOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook ──
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

/**
 * Get the underlying provider client for provider-specific UI components.
 * This is the ONLY place provider-specific code should leak through.
 */
export function getProviderClient() {
  return adapter.getProviderClient()
}

// Re-export types so consumers import from one place
export { UserRole } from '@/lib/auth'
export type { AuthUser } from '@/lib/auth'
