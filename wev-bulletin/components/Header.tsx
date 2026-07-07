'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import UserProfile from './UserProfile';
import ThemeToggle from './ThemeToggle';
import LocaleSwitcher from './LocaleSwitcher';
import { zIndex } from '@/lib/design-tokens';
import { SITE_CONFIG } from '@/lib/site-config';

export default function Header({
  hasBanner,
  initialTheme = 'light',
}: { hasBanner?: boolean; initialTheme?: 'light' | 'dark' } = {}) {
  const [shouldShowHeader, setShouldShowHeader] = useState(false);
  const t = useTranslations('home');
  const tnav = useTranslations('navigation');

  useEffect(() => {
    let cancelled = false;

    const update = () => {
      if (cancelled) return;
      const mainLogo = document.querySelector('.main-logo');
      if (!(mainLogo instanceof HTMLElement)) {
        setShouldShowHeader(window.scrollY > 100);
        return;
      }
      const { bottom } = mainLogo.getBoundingClientRect();
      setShouldShowHeader(bottom <= 0);
    };

    const onScrollOrResize = () => update();

    update();
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    return () => {
      cancelled = true;
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, []);

  const showHeader = shouldShowHeader;

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
        {/* Logo — left */}
        <div
          className={`transition-opacity duration-200 ${showHeader ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          <Link href="/" prefetch={false} aria-label={t('heading')} title={t('heading')}>
            <Image
              src={SITE_CONFIG.logotypeUrl}
              alt=""
              width={60}
              height={24}
              priority
              unoptimized
              className="wev-logotype w-[60px] h-auto cursor-pointer"
            />
          </Link>
        </div>

        {/* Right side: nav links + settings + user */}
        <div className="flex items-center gap-6">
          <nav className="hidden sm:flex items-center gap-6">
            <Link
              href="/"
              className="text-sm font-normal text-muted-foreground hover:text-foreground transition-colors py-[0.4rem]"
            >
              {tnav('jobs')}
            </Link>
            <Link
              href="/organizations"
              className="text-sm font-normal text-muted-foreground hover:text-foreground transition-colors py-[0.4rem]"
            >
              {tnav('companies')}
            </Link>
          </nav>
          <div className="flex items-stretch gap-4">
            <div className="hidden lg:block">
              <LocaleSwitcher />
            </div>
            <div className="hidden lg:block">
              <ThemeToggle initialTheme={initialTheme} />
            </div>
          </div>
          {/* Menu — buttons in hamburger below lg, settings below md, nav below sm */}
          <div className="lg:hidden">
            <UserProfile
              showThemeInMenu={true}
              showLocaleInMenu={true}
              initialTheme={initialTheme}
            >
              <div className="sm:hidden">
                <Link
                  href="/"
                  className="block px-4 py-2 text-sm text-foreground hover:bg-wev-primary-tint/20 hover:text-wev-primary-text transition-all duration-700 ease-in-out rounded"
                >
                  {tnav('jobs')}
                </Link>
                <Link
                  href="/organizations"
                  className="block px-4 py-2 text-sm text-foreground hover:bg-wev-primary-tint/20 hover:text-wev-primary-text transition-all duration-700 ease-in-out rounded"
                >
                  {tnav('companies')}
                </Link>
              </div>
            </UserProfile>
          </div>
          {/* Desktop menu — everything inline */}
          <div className="hidden lg:block">
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
