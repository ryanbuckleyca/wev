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
    <div className="flex items-stretch gap-0 border border-wev-border rounded-full overflow-hidden self-stretch min-h-[28px]">
      <button
        onClick={() => switchLocale('en')}
        className={`px-3 py-1 text-sm transition-colors h-full ${
          locale === 'en'
            ? 'bg-white dark:bg-wev-surface font-bold text-black dark:text-wev-text-primary'
            : 'bg-wev-surface-tint font-normal text-wev-text-tertiary'
        }`}
        aria-label={t('ariaLabels.localeSwitcher.switchToEnglish')}
        aria-pressed={locale === 'en'}
      >
        EN
      </button>
      <button
        onClick={() => switchLocale('fr')}
        className={`px-3 py-1 text-sm transition-colors h-full ${
          locale === 'fr'
            ? 'bg-white dark:bg-wev-surface font-bold text-black dark:text-wev-text-primary'
            : 'bg-wev-surface-tint font-normal text-wev-text-tertiary'
        }`}
        aria-label={t('ariaLabels.localeSwitcher.switchToFrench')}
        aria-pressed={locale === 'fr'}
      >
        FR
      </button>
    </div>
  )
}
