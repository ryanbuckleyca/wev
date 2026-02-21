'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export default function AuthStatus() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) return null

  if (!user) {
    return (
      <a
        href="/login"
        className="text-sm font-medium underline"
        style={{ color: 'var(--primary-text)' }}
      >
        Log in
      </a>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {user.email}
      </span>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="text-sm font-medium underline"
          style={{ color: 'var(--text-secondary)' }}
        >
          Log out
        </button>
      </form>
    </div>
  )
}
