'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import notify from '@/lib/toast'
import { getSiteBaseUrl } from '@/lib/site-url'
import Button from '@/components/Button'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Lineicons } from '@lineiconshq/react-lineicons'
import { MenuHamburger1Outlined, XmarkOutlined } from '@lineiconshq/free-icons'

import ThemeToggle from './ThemeToggle'
import LocaleSwitcher from './LocaleSwitcher'

interface UserProfileProps {
  showThemeInMenu?: boolean
  showLocaleInMenu?: boolean
}

export default function UserProfile({ showThemeInMenu = false, showLocaleInMenu = false }: UserProfileProps) {
  const t = useTranslations()
  const locale = useLocale()
  const { user, role, loading } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
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
      // Hard redirect to avoid client-side navigation getting stuck (e.g. with useRequireAuth)
      const base = getSiteBaseUrl() || window.location.origin
      window.location.href = `${base.replace(/\/$/, '')}/${locale}`
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('userProfile.logoutFailed'))
      setIsLoggingOut(false)
    }
  }

  if (loading) {
    return (
      <div className="h-10 w-10 rounded-full bg-border animate-pulse" />
    )
  }

  if (!user) {
    return (
      <div className="relative" ref={mobileMenuRef}>
        {/* Mobile hamburger menu */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="sm:hidden p-2 rounded-lg transition-colors relative z-50"
          aria-label={t('userProfile.openMenu')}
        >
          <Lineicons
            icon={isMobileMenuOpen ? XmarkOutlined : MenuHamburger1Outlined}
            size={24}
            className="text-foreground"
          />
        </button>

        {/* Desktop login/signup buttons */}
        <div className="hidden sm:flex sm:flex-row sm:gap-2">
          <Link
            href="/login"
            className="w-full sm:w-auto px-4 py-2 h-10 flex items-center justify-center text-sm font-semibold text-primary border border-primary rounded-wev-btn hover:bg-primary-tint transition-colors"
          >
            {t('userProfile.logIn')}
          </Link>
          <Link
            href="/signup"
            className="w-full sm:w-auto px-4 py-2 h-10 flex items-center justify-center text-sm font-semibold text-white bg-primary rounded-wev-btn hover:bg-opacity-90 transition-all"
          >
            {t('userProfile.signUp')}
          </Link>
        </div>

        {/* Mobile menu dropdown */}
        {isMobileMenuOpen && (
          <>
            <div 
              className="fixed inset-0 bg-black/15 z-40 opacity-0 animate-fade-in"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-wev-card z-50 shadow-wev-dropdown transition-all duration-700 ease-in-out">
            <div className="p-4 space-y-3">
              <div className="space-y-2">
                <Link
                  href="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block w-full px-4 py-2 text-center text-sm font-semibold text-primary border border-primary rounded-wev-btn hover:bg-primary-tint transition-all duration-700 ease-in-out"
                >
                  {t('userProfile.logIn')}
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block w-full px-4 py-2 text-center text-sm font-semibold text-white bg-primary rounded-wev-btn hover:bg-opacity-90 transition-all duration-700 ease-in-out"
                >
                  {t('userProfile.signUp')}
                </Link>
              </div>
              {(showThemeInMenu || showLocaleInMenu) && (
                <>
                  <div className="border-t border-border"></div>
                  <div className="space-y-3">
                    {showThemeInMenu && (
                      <div className="flex items-center gap-3 transition-colors duration-700 ease-in-out">
                        <ThemeToggle />
                        <span className="text-sm text-muted-foreground transition-colors duration-700 ease-in-out">{t('userProfile.theme')}</span>
                      </div>
                    )}
                    {showLocaleInMenu && (
                      <div className="flex items-center gap-3 transition-colors duration-700 ease-in-out">
                        <LocaleSwitcher />
                        <span className="text-sm text-muted-foreground transition-colors duration-700 ease-in-out">{t('userProfile.language')}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm flex-shrink-0 border border-border relative z-50"
      >
        {user.email ? user.email[0].toUpperCase() : '?'}
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/15 z-40 opacity-0 animate-fade-in"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-wev-card z-50 shadow-wev-dropdown transition-all duration-700 ease-in-out">
          <div className="p-4 border-b border-border transition-colors duration-700 ease-in-out">
            <p className="text-sm text-foreground font-semibold truncate transition-colors duration-700 ease-in-out">{user.email}</p>
            <p className="text-xs text-wev-text-tertiary mt-1 transition-colors duration-700 ease-in-out">{t('userProfile.role')} {role}</p>
          </div>

          <nav className="py-2">
            <Link
              href="/profile"
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2 text-sm text-foreground hover:bg-wev-primary-tint/20 hover:text-wev-primary-text transition-all duration-700 ease-in-out rounded"
              prefetch={true}
            >
              {t('userProfile.myProfile')}
            </Link>
            <Link
              href="/bookmarks"
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2 text-sm text-foreground hover:bg-wev-primary-tint/20 hover:text-wev-primary-text transition-all duration-700 ease-in-out rounded"
              prefetch={true}
            >
              {t('userProfile.myBookmarks')}
            </Link>
            <Link
              href="/account-settings"
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2 text-sm text-foreground hover:bg-wev-primary-tint/20 hover:text-wev-primary-text transition-all duration-700 ease-in-out rounded"
              prefetch={true}
            >
              {t('userProfile.accountSettings')}
            </Link>
          </nav>

          {(showThemeInMenu || showLocaleInMenu) && (
            <div className="p-3 border-t border-border space-y-3 transition-colors duration-700 ease-in-out">
              {showThemeInMenu && (
                <div className="flex items-center gap-3 transition-colors duration-700 ease-in-out">
                  <ThemeToggle />
                  <span className="text-sm text-muted-foreground transition-colors duration-700 ease-in-out">{t('userProfile.theme')}</span>
                </div>
              )}
              {showLocaleInMenu && (
                <div className="flex items-center gap-3 transition-colors duration-700 ease-in-out">
                  <LocaleSwitcher />
                  <span className="text-sm text-muted-foreground transition-colors duration-700 ease-in-out">{t('userProfile.language')}</span>
                </div>
              )}
            </div>
          )}

          <div className="p-2 border-t border-border">
            <Button
              onClick={handleLogout}
              disabled={isLoggingOut}
              loading={isLoggingOut}
              fullWidth
              className="w-full bg-wev-destructive-tint text-destructive-foreground border-none"
            >
              {isLoggingOut ? t('userProfile.loggingOut') : t('userProfile.logOut')}
            </Button>
          </div>
        </div>
        </>
      )}
    </div>
  )
}
