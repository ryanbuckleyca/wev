'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const supabase = createClient()

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })

      if (error) {
        setError(error.message)
      } else {
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
              We've sent a password reset link to {email}. Click it to set a new password.
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
          <h1 className="design-type-h2 mb-2 text-[var(--text-primary)]">Reset Password</h1>
          <p className="design-type-body text-[var(--text-secondary)] mb-6">
            Enter your email and we'll send you a reset link
          </p>

          {error && (
            <div className="design-toast design-toast-alert mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleReset} className="space-y-5">
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

            <button
              type="submit"
              disabled={loading}
              className="design-btn design-btn-primary w-full"
            >
              {loading ? 'Sending reset link...' : 'Send Reset Link'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/auth/login"
              className="design-type-body-small text-[var(--primary-text)] hover:underline"
            >
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}