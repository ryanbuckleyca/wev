'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import notify from '@/lib/toast'
import Button from '@/components/Button'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

export default function UserProfile() {
  const { user, role, loading } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const dropdownRef = useRef<HTMLDivElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false)
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
      notify.success('Logged out successfully')
      router.push('/')
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Logout failed')
      setIsLoggingOut(false)
    }
  }

  if (loading) {
    return (
      <div className="h-10 w-10 rounded-full bg-wev-border animate-pulse" />
    )
  }

  if (!user) {
    return (
      <div className="relative" ref={mobileMenuRef}>
        {/* Mobile hamburger menu */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="sm:hidden p-2 rounded-lg hover:bg-wev-primary-tint/20 transition-colors"
          aria-label="Open menu"
        >
          <svg
            className="w-6 h-6 text-wev-text-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {isMobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>

        {/* Desktop login/signup buttons */}
        <div className="hidden sm:flex sm:flex-row sm:gap-2">
          <Link
            href="/login"
            className="w-full sm:w-auto px-4 py-2 h-10 flex items-center justify-center text-sm font-semibold text-wev-primary border border-wev-primary rounded-wev-btn hover:bg-wev-primary-tint transition-colors"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="w-full sm:w-auto px-4 py-2 h-10 flex items-center justify-center text-sm font-semibold text-white bg-wev-primary rounded-wev-btn hover:bg-opacity-90 transition-all"
          >
            Sign Up
          </Link>
        </div>

        {/* Mobile menu dropdown */}
        {isMobileMenuOpen && (
          <div className="absolute right-0 mt-2 w-56 bg-wev-surface border border-wev-border rounded-wev-card z-50">
            <div className="p-4 space-y-3">
              {/* Divider */}
              <div className="border-t border-wev-border pt-1">
                <div className="space-y-2 pt-3">
                  <Link
                    href="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block w-full px-4 py-2 text-center text-sm font-semibold text-wev-primary border border-wev-primary rounded-wev-btn hover:bg-wev-primary-tint transition-colors"
                  >
                    Log In
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block w-full px-4 py-2 text-center text-sm font-semibold text-white bg-wev-primary rounded-wev-btn hover:bg-opacity-90 transition-all"
                  >
                    Sign Up
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

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
              href="/bookmarks"
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2 text-sm text-wev-text-primary hover:bg-wev-primary-tint/20 hover:text-wev-primary-text transition-colors rounded"
              prefetch={true}
            >
              My Bookmarks
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
              {isLoggingOut ? 'Logging out...' : 'Log Out'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
