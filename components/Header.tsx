'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import UserProfile from './UserProfile';
import ThemeToggle from './ThemeToggle';
import LocaleSwitcher from './LocaleSwitcher';
import { zIndex } from '@/lib/design-tokens';

export default function Header({ hasBanner }: { hasBanner?: boolean } = {}) {
  const [shouldShowHeader, setShouldShowHeader] = useState(false);
  const pathname = usePathname();
  const locale = useLocale();
  // Check if we're on the home page (with or without locale prefix)
  const isHomePage =
    pathname === '/' || pathname === `/${locale}` || pathname.match(/^\/[a-z]{2}$/);

  useEffect(() => {
    const handleScroll = () => {
      if (isHomePage) {
        // On home page, show header when main logo scrolls out of view
        const mainLogo = document.querySelector('.main-logo');
        if (mainLogo) {
          const rect = mainLogo.getBoundingClientRect();
          const logoOutOfView = rect.bottom < 0;
          setShouldShowHeader(logoOutOfView);
        }
      }
      // On other pages, header is always shown by default - no scroll logic needed
    };

    if (isHomePage) {
      window.addEventListener('scroll', handleScroll);
      // Initial check for home page
      handleScroll();

      return () => window.removeEventListener('scroll', handleScroll);
    }
    // For non-home pages, no scroll listener needed
  }, [isHomePage]);

  // On non-home pages, show header by default
  // On home page, show based on scroll position
  const showHeader = !isHomePage || shouldShowHeader;

  // Offset header if any banner is present
  const topOffset = hasBanner ? 'top-[22px]' : 'top-0';

  return (
    <header
      className={`fixed ${topOffset} right-0 left-0 transition-all duration-200 ${
        showHeader ? 'bg-card border-b border-border' : 'bg-transparent'
      }`}
      style={{ zIndex: zIndex.header }}
    >
      <div className="flex items-center justify-between px-4 py-4">
        <div
          className={`transition-opacity duration-200 ${showHeader ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          <Link href="/">
            <img
              src="https://teuvfoftdjfsnkkbnzps.supabase.co/storage/v1/object/public/bulletin/wev-logotype.png"
              alt="wev"
              className="wev-logotype w-[60px] h-auto cursor-pointer"
            />
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-stretch gap-4">
            <div className="hidden sm:block">
              <LocaleSwitcher />
            </div>
            <div className="hidden md:block">
              <ThemeToggle />
            </div>
          </div>
          {/* Mobile menu - show theme/locale when hidden from header */}
          <div className="sm:hidden">
            <UserProfile showThemeInMenu={true} showLocaleInMenu={true} />
          </div>
          {/* Desktop menu - don't show theme/locale */}
          <div className="hidden sm:block">
            <UserProfile showThemeInMenu={false} showLocaleInMenu={false} />
          </div>
        </div>
      </div>
    </header>
  );
}
