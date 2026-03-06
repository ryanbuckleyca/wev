'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import LinkButton from '@/components/LinkButton'
import Button from '@/components/Button'
import notify from '@/lib/toast'

export default function AuthStatus() {
  const router = useRouter()
  const t = useTranslations()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
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

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await supabase.auth.signOut()
      notify.success(t('userProfile.logoutSuccess'))
      router.push('/')
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('userProfile.logoutFailed'))
      setIsLoggingOut(false)
    }
  }

  if (loading) return null

  if (!user) {
    return (
      <LinkButton href="/login" size="sm">
        Log in
      </LinkButton>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {user.email}
      </span>
      <Button
        onClick={handleLogout}
        variant="outline"
        size="sm"
        disabled={isLoggingOut}
      >
        {isLoggingOut ? 'Logging out...' : 'Log out'}
      </Button>
    </div>
  )
}
