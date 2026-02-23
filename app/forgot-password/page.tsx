'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import TurnstileWidget from '@/components/TurnstileWidget'
import FormInput from '@/components/FormInput'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    setError(null)

    if (!captchaToken) {
      setError('Please complete the CAPTCHA verification.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
      captchaToken,
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Check your email for a password reset link.')
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
          className="text-2xl font-semibold text-center mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          Forgot password?
        </h1>
        <p
          className="text-sm text-center mb-6"
          style={{ color: 'var(--text-secondary)' }}
        >
          Enter your email and we&apos;ll send you a reset link.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Email
            </span>
            <FormInput
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              required
            />
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
            disabled={loading || !captchaToken}
            className="rounded px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
          >
            {loading ? 'Sending…' : 'Send reset link'}
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
          Remember your password?{' '}
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
