'use client'

import { useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Hook for pages that require authentication.
 * Redirects to /login if there is no active session.
 * Returns the authenticated user once confirmed, or null while loading.
 */
export function useRequireAuth() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const shouldRedirect = !loading && !user

  useEffect(() => {
    if (shouldRedirect) {
      router.replace('/login')
    }
  }, [shouldRedirect, router])

  return {
    user,
    loading: loading || shouldRedirect,
  }
}
