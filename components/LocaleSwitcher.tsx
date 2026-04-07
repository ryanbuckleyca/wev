'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { JOB_BOARD_TEST_IDS } from '@/lib/testing/job-board-contract';

function buildLocaleSwitchHref(
  pathname: ReturnType<typeof usePathname>,
  searchParams: ReturnType<typeof useSearchParams>,
) {
  const queryString = searchParams.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

export default function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations();

  const toggleLocale = () => {
    const newLocale = locale === 'en' ? 'fr' : 'en';
    // `next-intl` keeps route typing on the locale-agnostic pathname, but we
    // need the raw query string here so repeated params survive intact.
    const nextHref = buildLocaleSwitchHref(pathname, searchParams) as Parameters<
      typeof router.replace
    >[0];
    router.replace(nextHref, { locale: newLocale });
  };

  return (
    <button
      type="button"
      onClick={toggleLocale}
      data-testid={JOB_BOARD_TEST_IDS.localeSwitcher}
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
