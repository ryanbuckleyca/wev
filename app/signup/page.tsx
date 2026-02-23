'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { checkPasswordStrength } from '@/lib/password-strength'
import TurnstileWidget from '@/components/TurnstileWidget'
import PasswordStrengthIndicator from '@/components/PasswordStrengthIndicator'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  const passwordStrength = useMemo(() => {
    if (!password) return null
    return checkPasswordStrength(password)
  }, [password])

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    setError(null)

    if (passwordStrength && !passwordStrength.isAcceptable) {
      setError('Password is too weak. Please choose a stronger password.')
      setLoading(false)
      return
    }

    if (!captchaToken) {
      setError('Please complete the CAPTCHA verification.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        captchaToken,
      },
    })
    if (error) {
      setError(error.message)
    } else {
      setMessage('Check your email for a confirmation link.')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div
        className="w-full max-w-sm rounded-lg p-8"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h1
          className="text-2xl font-semibold text-center mb-6"
          style={{ color: 'var(--text-primary)' }}
        >
          Sign up
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded px-3 py-2 text-sm outline-none"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              placeholder="you@example.com"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Password
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
            <PasswordStrengthIndicator passwordStrength={passwordStrength} />
          </label>

          <TurnstileWidget
            onSuccess={(token) => setCaptchaToken(token)}
            onError={() => {
              setCaptchaToken(null)
              setError('CAPTCHA verification failed. Please try again.')
            }}
            onExpire={() => setCaptchaToken(null)}
          />

          <button
            type="submit"
            disabled={loading || (passwordStrength !== null && !passwordStrength.isAcceptable) || !captchaToken}
            className="rounded px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
          >
            {loading ? 'Loading…' : 'Sign up'}
          </button>
        </form>

        {error && (
          <p className="mt-4 text-sm text-center" style={{ color: 'var(--alert-text)' }}>
            {error}
          </p>
        )}
        {message && (
          <p className="mt-4 text-sm text-center" style={{ color: 'var(--success-text)' }}>
            {message}
          </p>
        )}

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          Already have an account?{' '}
          <Link
            href="/login"
            className="underline font-medium"
            style={{ color: 'var(--primary-text)' }}
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
