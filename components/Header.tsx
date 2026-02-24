'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import ThemeToggle from './ThemeToggle'
import UserProfile from './UserProfile'

export default function Header({ hasBanner }: { hasBanner?: boolean } = {}) {
  const [shouldShowHeader, setShouldShowHeader] = useState(false)
  const pathname = usePathname()
  const isHomePage = pathname === '/'

  useEffect(() => {
    const handleScroll = () => {
      if (isHomePage) {
        // On home page, show header when main logo scrolls out of view
        const mainLogo = document.querySelector('.main-logo')
        if (mainLogo) {
          const rect = mainLogo.getBoundingClientRect()
          const logoOutOfView = rect.bottom < 0
          setShouldShowHeader(logoOutOfView)
        }
      }
      // On other pages, header is always shown by default - no scroll logic needed
    }

    if (isHomePage) {
      window.addEventListener('scroll', handleScroll)
      // Initial check for home page
      handleScroll()
      
      return () => window.removeEventListener('scroll', handleScroll)
    }
    // For non-home pages, no scroll listener needed
  }, [isHomePage])

  // On non-home pages, show header by default
  // On home page, show based on scroll position
  const showHeader = !isHomePage || shouldShowHeader

  // Offset header if any banner is present
  const topOffset = hasBanner ? 'top-[22px]' : 'top-0'

  return (
    <header
      className={`fixed ${topOffset} right-0 left-0 z-50 transition-all duration-200 ${
        showHeader ? 'bg-wev-surface border-b border-wev-border' : 'bg-transparent'
      }`}
    >
      <div className="flex items-center justify-between px-8 py-4">
        <div className={`transition-opacity duration-200 ${showHeader ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
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
