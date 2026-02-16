'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthCallbackPage() {
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    let mounted = true

    const handleCallback = async () => {
      try {
        // Wait for Supabase to process the verification token from the URL hash
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (!mounted) return

        if (sessionError) {
          setError('Verification failed: ' + sessionError.message)
          return
        }

        if (session) {
          // Email verified and session established - redirect to home
          router.push('/')
        } else {
          // Listen for auth state changes (session establishment from token processing)
          const { data: authListener } = supabase.auth.onAuthStateChange(
            async (event, newSession) => {
              if (!mounted) return

              if (event === 'SIGNED_IN' && newSession) {
                // User just verified email and is now signed in
                router.push('/')
              } else if (event === 'SIGNED_OUT' || !newSession) {
                // No valid session - token may be invalid
                if (!session) {
                  setError('Verification link is invalid or expired')
                }
              }
            }
          )

          return () => {
            authListener?.subscription.unsubscribe()
          }
        }
      } catch (err) {
        if (mounted) {
          setError('An error occurred during verification')
        }
      }
    }

    handleCallback()

    return () => {
      mounted = false
    }
  }, [supabase.auth, router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-4">
        <div className="w-full max-w-md">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
            <h1 className="design-type-h2 mb-2 text-[var(--text-primary)]">Verification Failed</h1>
            <p className="design-type-body text-[var(--text-secondary)] mb-6">{error}</p>
            <a
              href="/auth/signup"
              className="design-btn design-btn-primary inline-block"
            >
              Try Again
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="text-center">
        <p className="design-type-body text-[var(--text-secondary)]">Verifying email...</p>
      </div>
    </div>
  )
}
