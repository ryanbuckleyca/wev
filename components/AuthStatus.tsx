'use client'

import { useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { getSiteBaseUrl } from '@/lib/site-url'
import type { User } from '@supabase/supabase-js'
import LinkButton from '@/components/LinkButton'
import Button from '@/components/Button'
import notify from '@/lib/toast'

export default function AuthStatus() {
  const t = useTranslations()
  const locale = useLocale()
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
      const base = getSiteBaseUrl() || window.location.origin
      window.location.href = `${base.replace(/\/$/, '')}/${locale}`
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
      <span className="text-sm text-muted-foreground">
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
