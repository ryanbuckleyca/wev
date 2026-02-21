'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
    } else {
      window.location.href = '/'
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
          Log in
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
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
          >
            {loading ? 'Loading…' : 'Log in'}
          </button>
        </form>

        {error && (
          <p className="mt-4 text-sm text-center" style={{ color: 'var(--alert-text)' }}>
            {error}
          </p>
        )}

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="underline font-medium"
            style={{ color: 'var(--primary-text)' }}
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
