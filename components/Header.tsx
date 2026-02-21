'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ThemeToggle from './ThemeToggle'
import UserProfile from './UserProfile'

export default function Header({ hasBanner }: { hasBanner?: boolean } = {}) {
  const [hasScrolled, setHasScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setHasScrolled(window.scrollY > 0)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Offset header if any banner is present
  const topOffset = hasBanner ? 'top-[22px]' : 'top-0'

  return (
    <header
      className={`fixed ${topOffset} right-0 left-0 z-50 transition-all duration-200 ${
        hasScrolled ? 'bg-wev-surface border-b border-wev-border' : 'bg-transparent'
      }`}
    >
      <div className="flex items-center justify-between px-8 py-4">
        <div className={`transition-opacity duration-200 ${hasScrolled ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <Link href="/">
            <img
              src="https://teuvfoftdjfsnkkbnzps.supabase.co/storage/v1/object/public/bulletin/wev-logotype.png"
              alt="wev"
              className="wev-logotype w-[60px] h-auto cursor-pointer"
            />
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <UserProfile />
        </div>
      </div>
    </header>
  )
}
