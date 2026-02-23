'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { checkPasswordStrength } from '@/lib/password-strength'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isValidSession, setIsValidSession] = useState(false)
  const router = useRouter()

  const supabase = createClient()

  const passwordStrength = useMemo(() => {
    if (!password) return null
    return checkPasswordStrength(password)
  }, [password])

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setIsValidSession(true)
      } else {
        setError('Invalid or expired reset link. Please request a new one.')
      }
    }
    checkSession()
  }, [supabase.auth])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (passwordStrength && !passwordStrength.isAcceptable) {
      setError('Password is too weak. Please choose a stronger password.')
      setLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      // User is already authenticated after password reset, redirect to home
      router.push('/')
    }
  }

  if (!isValidSession && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div
        className="w-full max-w-sm rounded-lg p-8"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h1
          className="text-2xl font-semibold text-center mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          Reset password
        </h1>
        <p
          className="text-sm text-center mb-6"
          style={{ color: 'var(--text-secondary)' }}
        >
          Enter your new password below.
        </p>

        {isValidSession ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                New Password
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded px-3 py-2 text-sm outline-none"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                placeholder="••••••••"
              />
              {passwordStrength && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-2">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="flex-1 h-1.5 rounded-full transition-colors"
                        style={{
                          backgroundColor:
                            i <= passwordStrength.score
                              ? passwordStrength.color
                              : 'var(--border)',
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs">
                      Strength:{' '}
                      <span style={{ color: passwordStrength.color }} className="font-semibold">
                        {passwordStrength.label}
                      </span>
                    </span>
                    {passwordStrength.isAcceptable && (
                      <span className="text-xs" style={{ color: 'var(--success-solid)' }}>
                        ✓ Acceptable
                      </span>
                    )}
                  </div>
                  {passwordStrength.feedback && !passwordStrength.isAcceptable && (
                    <p className="text-xs mt-1" style={{ color: 'var(--warn-solid)' }}>
                      {passwordStrength.feedback}
                    </p>
                  )}
                </div>
              )}
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                Confirm Password
              </span>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="rounded px-3 py-2 text-sm outline-none"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                placeholder="••••••••"
              />
            </label>

            <button
              type="submit"
              disabled={loading || (passwordStrength !== null && !passwordStrength.isAcceptable)}
              className="rounded px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        ) : (
          <div className="text-center">
            <p className="text-sm mb-4" style={{ color: 'var(--alert-text)' }}>
              {error}
            </p>
            <a
              href="/forgot-password"
              className="text-sm underline font-medium"
              style={{ color: 'var(--primary-text)' }}
            >
              Request a new reset link
            </a>
          </div>
        )}

        {error && isValidSession && (
          <p className="mt-4 text-sm text-center" style={{ color: 'var(--alert-text)' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
