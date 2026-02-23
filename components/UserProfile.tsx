'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import Button from '@/components/Button'
import LinkButton from '@/components/LinkButton'

type UserRole = 'admin' | 'moderator' | 'user'

export default function UserProfile() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [dbRoles, setDbRoles] = useState<string[]>(['user'])
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mounted = true

    const fetchRoles = async (userId: string) => {
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('roles')
          .eq('user_id', userId)
          .single()

        if (!mounted) return

        if (!error && data && Array.isArray(data.roles)) {
          setDbRoles(data.roles)
        } else {
          setDbRoles(['user'])
        }
      } catch {
        if (mounted) {
          setDbRoles(['user'])
        }
      }
    }

    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!mounted) return

        setUser(session?.user ?? null)

        if (session?.user) {
          await fetchRoles(session.user.id)
        } else {
          setDbRoles(['user'])
        }
      } catch {
        if (mounted) return
        setUser(null)
        setDbRoles(['user'])
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }
    checkSession()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return
        setUser(session?.user ?? null)

        if (session?.user) {
          await fetchRoles(session.user.id)
        } else {
          setDbRoles(['user'])
        }

        setLoading(false)
      }
    )

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [supabase])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    setIsLoggingOut(true)
    setIsOpen(false)
    try {
      await supabase.auth.signOut()
      toast.success('Logged out successfully')
      router.push('/')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Logout failed')
      setIsLoggingOut(false)
    }
  }

  const getUserRole = (): UserRole => {
    if (!dbRoles || dbRoles.length === 0) return 'user'
    if (dbRoles.includes('admin')) return 'admin'
    if (dbRoles.includes('moderator')) return 'moderator'
    return 'user'
  }

  const getRoleColor = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return 'bg-wev-alert-tint text-wev-alert-text'
      case 'moderator':
        return 'bg-wev-info-tint text-wev-info-text'
      default:
        return 'bg-wev-primary-tint text-wev-primary-text'
    }
  }

  if (loading) {
    return (
      <div className="h-10 w-10 rounded-full bg-wev-border animate-pulse" />
    )
  }

  if (!user) {
    return (
      <div className="flex gap-2">
        <Link
          href="/login"
          className="px-4 py-2 h-10 flex items-center text-sm font-semibold text-wev-primary border border-wev-primary rounded-wev-btn hover:bg-wev-primary-tint transition-colors"
        >
          Log In
        </Link>
        <Link
          href="/signup"
          className="px-4 py-2 h-10 flex items-center text-sm font-semibold text-white bg-wev-primary rounded-wev-btn hover:bg-opacity-90 transition-all"
        >
          Sign Up
        </Link>
      </div>
    )
  }

  const role = getUserRole()

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-full bg-wev-primary flex items-center justify-center text-white font-bold text-sm flex-shrink-0 border border-wev-border transition-all"
      >
        {user.email ? user.email[0].toUpperCase() : '?'}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-wev-surface border border-wev-border rounded-wev-card z-50">
          <div className="p-4 border-b border-wev-border">
            <p className="text-sm text-wev-text-primary font-semibold truncate">{user.email}</p>
            <p className="text-xs text-wev-text-tertiary mt-1">Role: {role}</p>
          </div>

          <nav className="py-2">
            <Link
              href="/profile"
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2 text-sm text-wev-text-primary hover:bg-wev-primary-tint/20 hover:text-wev-primary-text transition-colors rounded"
              prefetch={true}
            >
              My Profile
            </Link>
            <Link
              href="/account-settings"
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2 text-sm text-wev-text-primary hover:bg-wev-primary-tint/20 hover:text-wev-primary-text transition-colors rounded"
              prefetch={true}
            >
              Account Settings
            </Link>
          </nav>

          <div className="p-2 border-t border-wev-border">
            <Button
              onClick={handleLogout}
              disabled={isLoggingOut}
              loading={isLoggingOut}
              fullWidth
              className="w-full"
              style={{
                background: 'var(--alert-tint)',
                color: 'var(--alert-text)',
                border: 'none'
              }}
            >
              Log Out
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
