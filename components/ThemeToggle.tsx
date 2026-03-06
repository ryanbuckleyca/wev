'use client'

import { useEffect, useState, useRef } from 'react'
import { useTranslations } from 'next-intl'

function getInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  // Always read from localStorage as source of truth
  const stored = localStorage.getItem('theme')
  if (stored === 'dark' || stored === 'light') return stored
  return 'light'
}

export default function ThemeToggle() {
  const t = useTranslations('ariaLabels.themeToggle')
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme)
  const [mounted, setMounted] = useState(false)
  const isInitialMount = useRef(true)

  useEffect(() => {
    setMounted(true)
    
    // On initial mount, sync with localStorage (ignore DOM during locale changes)
    if (isInitialMount.current) {
      const stored = localStorage.getItem('theme')
      if (stored === 'dark' || stored === 'light') {
        setTheme(stored)
        // Ensure DOM matches localStorage
        document.documentElement.setAttribute('data-theme', stored)
      }
      isInitialMount.current = false
    }
    
    // Watch for theme changes on the DOM (but don't override localStorage)
    const observer = new MutationObserver(() => {
      const current = document.documentElement.getAttribute('data-theme') as 'light' | 'dark'
      const stored = localStorage.getItem('theme')
      // Only update if DOM matches localStorage (to avoid conflicts)
      if (current === stored && (current === 'dark' || current === 'light')) {
        setTheme(current)
      }
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })

    return () => observer.disconnect()
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
  }

  if (!mounted) return null

  return (
    <div className="flex items-stretch border border-wev-border rounded-full overflow-hidden self-stretch min-h-[28px]">
      <button
        type="button"
        onClick={toggle}
        className={`relative flex py-1 w-14 items-center justify-start rounded-full transition-colors h-full ${
          theme === 'dark' ? 'bg-wev-bg' : 'bg-wev-surface-tint'
        }`}
        aria-label={theme === 'dark' ? t('switchToLight') : t('switchToDark')}
      >
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-all duration-200 ${
            theme === 'dark' ? 'ml-auto mr-0.5' : 'ml-0.5'
          } ${
            theme === 'dark' ? 'bg-wev-surface' : 'bg-wev-surface'
          }`}
        >
          <span className="text-xl leading-none">{theme === 'dark' ? '☀️' : '🌙'}</span>
        </span>
      </button>
    </div>
  )
}
