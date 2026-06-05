'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import UserProfile from './UserProfile';
import ThemeToggle from './ThemeToggle';
import LocaleSwitcher from './LocaleSwitcher';
import { zIndex } from '@/lib/design-tokens';

const HEADER_LOGOTYPE_URL =
  'https://teuvfoftdjfsnkkbnzps.supabase.co/storage/v1/object/public/bulletin/wev-logotype.png';

export default function Header({
  hasBanner,
  initialTheme = 'light',
}: { hasBanner?: boolean; initialTheme?: 'light' | 'dark' } = {}) {
  const [shouldShowHeader, setShouldShowHeader] = useState(false);
  const pathname = usePathname();
  const t = useTranslations('home');
  const isHomePage = pathname === '/' || pathname === '/jobs';

  useEffect(() => {
    if (!isHomePage) {
      return;
    }

    let cancelled = false;
    let waitRaf = 0;

    const update = () => {
      if (cancelled) return;
      const mainLogo = document.querySelector('.main-logo');
      if (!(mainLogo instanceof HTMLElement)) {
        // Fallback: if logo not found, check scroll position
        setShouldShowHeader(window.scrollY > 100);
        return;
      }
      const { bottom } = mainLogo.getBoundingClientRect();
      setShouldShowHeader(bottom <= 0);
    };

    const onScrollOrResize = () => update();

    // Initial check and add listeners immediately.
    // We don't wait for the logo, as the fallback logic (scrollY > 100) 
    // needs to work even if the logo is missing.
    update();
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    return () => {
      cancelled = true;
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
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
          <Link href="/" prefetch={false} aria-label={t('heading')} title={t('heading')}>
            <Image
              src={HEADER_LOGOTYPE_URL}
              alt=""
              width={60}
              height={24}
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
              <ThemeToggle initialTheme={initialTheme} />
            </div>
          </div>
          {/* Mobile menu - show theme/locale when hidden from header */}
          <div className="sm:hidden">
            <UserProfile
              showThemeInMenu={true}
              showLocaleInMenu={true}
              initialTheme={initialTheme}
            />
          </div>
          {/* Desktop menu - don't show theme/locale */}
          <div className="hidden sm:block">
            <UserProfile
              showThemeInMenu={false}
              showLocaleInMenu={false}
              initialTheme={initialTheme}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
