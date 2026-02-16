'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { checkPasswordStrength } from '@/lib/password-strength'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Calculate password strength
  const passwordStrength = useMemo(() => {
    if (!password) return null
    return checkPasswordStrength(password)
  }, [password])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Check password strength
    if (!passwordStrength || !passwordStrength.isAcceptable) {
      setError('Password is too weak. Please choose a stronger password.')
      return
    }

    setLoading(true)

    try {
      const redirectUrl = `${window.location.origin}/auth/callback`
      
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      })

      if (error) {
        setError(error.message)
      } else if (data.user) {
        setSuccess(true)
      }
    } catch (err) {
      setError('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-4">
        <div className="w-full max-w-md">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
            <h1 className="design-type-h2 mb-3 text-[var(--text-primary)]">Check your email</h1>
            <p className="design-type-body text-[var(--text-secondary)] mb-6">
              We've sent a confirmation link to {email}. Click it to verify your account.
            </p>
            <Link
              href="/auth/login"
              className="design-btn design-btn-tertiary inline-block text-[var(--primary-text)]"
            >
              Back to login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] p-4">
      <div className="w-full max-w-md">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8">
          <h1 className="design-type-h2 mb-2 text-[var(--text-primary)]">Create Account</h1>
          <p className="design-type-body text-[var(--text-secondary)] mb-6">Join the wev community</p>

          {error && (
            <div className="design-toast design-toast-alert mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-5">
            <div>
              <label className="block design-type-body font-semibold text-[var(--text-primary)] mb-2">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-2 design-type-body border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
              />
            </div>

            <div>
              <label className="block design-type-body font-semibold text-[var(--text-primary)] mb-2">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2 design-type-body border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
              />
              
              {/* Password Strength Meter */}
              {passwordStrength && (
                <div className="mt-3">
                  {/* Strength Bar */}
                  <div className="flex gap-1 mb-2">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="flex-1 h-2 rounded-full transition-colors"
                        style={{
                          backgroundColor:
                            i <= passwordStrength.score
                              ? passwordStrength.color
                              : 'var(--border)',
                        }}
                      />
                    ))}
                  </div>
                  
                  {/* Strength Label and Status */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="design-type-body-small">
                      Strength: <span style={{ color: passwordStrength.color }} className="font-semibold">
                        {passwordStrength.label}
                      </span>
                    </span>
                    {passwordStrength.isAcceptable && (
                      <span className="design-type-body-small text-[var(--success-solid)]">
                        ✓ Acceptable
                      </span>
                    )}
                  </div>
                  
                  {/* Feedback */}
                  {passwordStrength.feedback && !passwordStrength.isAcceptable && (
                    <p className="design-type-body-small text-[var(--warning-solid)]">
                      {passwordStrength.feedback}
                    </p>
                  )}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !passwordStrength?.isAcceptable}
              className="design-btn design-btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="design-type-body-small text-[var(--text-secondary)]">
              Already have an account?{' '}
              <Link
                href="/auth/login"
                className="text-[var(--primary-text)] font-semibold hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
