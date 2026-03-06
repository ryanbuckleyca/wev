'use client'

import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { useSearchParams } from 'next/navigation'

export default function LocaleSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()

  const switchLocale = (newLocale: 'en' | 'fr') => {
    if (newLocale === locale) return
    
    // Preserve query parameters when switching locales
    const queryString = searchParams.toString()
    
    // usePathname() returns pathname without locale prefix (e.g., "/" or "/profile")
    // router.replace with { locale } option will add the locale prefix automatically
    if (queryString) {
      router.replace(`${pathname}?${queryString}`, { locale: newLocale })
    } else {
      router.replace(pathname, { locale: newLocale })
    }
  }

  return (
    <div className="flex items-center justify-center border border-wev-border rounded-full overflow-hidden self-stretch min-h-[28px] h-[32px] transition-all duration-500 ease-in-out">
      <button
        onClick={() => switchLocale('en')}
        className="flex items-stretch gap-0 rounded-full overflow-hidden self-stretch h-full bg-white dark:bg-wev-surface font-bold text-black dark:text-wev-text-primary"
        aria-label={t('ariaLabels.localeSwitcher.switchToEnglish')}
        aria-pressed={locale === 'en'}
      >
        <span className="px-3 py-1 text-sm transition-all duration-500 ease-in-out h-full flex items-center justify-center bg-white dark:bg-wev-surface font-bold text-black dark:text-wev-text-primary">
          EN
        </span>
        <span className="px-3 py-1 text-sm transition-all duration-500 ease-in-out h-full flex items-center justify-center bg-wev-bg font-normal text-wev-text-tertiary">
          FR
        </span>
      </button>
      <button
        onClick={() => switchLocale('fr')}
        className="flex items-stretch gap-0 rounded-full overflow-hidden self-stretch h-full bg-white dark:bg-wev-surface font-bold text-black dark:text-wev-text-primary"
        aria-label={t('ariaLabels.localeSwitcher.switchToFrench')}
        aria-pressed={locale === 'fr'}
      >
        <span className="px-3 py-1 text-sm transition-all duration-500 ease-in-out h-full flex items-center justify-center bg-white dark:bg-wev-surface font-bold text-black dark:text-wev-text-primary">
          EN
        </span>
        <span className="px-3 py-1 text-sm transition-all duration-500 ease-in-out h-full flex items-center justify-center bg-wev-bg font-normal text-wev-text-tertiary">
          FR
        </span>
      </button>
    </div>
  )
}
