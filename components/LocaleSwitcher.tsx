'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';

export default function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations();

  const toggleLocale = () => {
    const newLocale = locale === 'en' ? 'fr' : 'en';

    // Preserve query parameters when switching locales
    const queryString = searchParams.toString();

    // usePathname() returns pathname without locale prefix (e.g., "/" or "/profile")
    // router.replace with { locale } option will add the locale prefix automatically
    if (queryString) {
      router.replace(`${pathname}?${queryString}`, { locale: newLocale });
    } else {
      router.replace(pathname, { locale: newLocale });
    }
  };

  return (
    <button
      onClick={toggleLocale}
      className="flex items-center justify-center border border-border rounded-full overflow-hidden self-stretch min-h-[28px] h-[32px] transition-all duration-500 ease-in-out hover:opacity-80 cursor-pointer"
      aria-label={t('ariaLabels.localeSwitcher.toggleLocale')}
    >
      <div className="flex items-center h-full">
        <div
          className={`px-3 py-1 text-sm transition-all duration-500 ease-in-out h-full flex items-center justify-center ${
            locale === 'en'
              ? 'bg-white dark:bg-card font-bold text-black dark:text-foreground'
              : 'bg-background font-normal text-wev-text-tertiary'
          }`}
        >
          EN
        </div>
        <div
          className={`px-3 py-1 text-sm transition-all duration-500 ease-in-out h-full flex items-center justify-center ${
            locale === 'fr'
              ? 'bg-white dark:bg-card font-bold text-black dark:text-foreground'
              : 'bg-background font-normal text-wev-text-tertiary'
          }`}
        >
          FR
        </div>
      </div>
    </button>
  );
}
