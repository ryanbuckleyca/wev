import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import Header from '@/components/Header';
import Toaster from '@/components/Toaster';
import HtmlLangSync from '@/components/HtmlLangSync';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProfileProvider } from '@/contexts/ProfileContext';
import { routing } from '@/i18n/routing';
import { DEFAULT_THEME } from '@/lib/theme';

/** Locale layout: intl, auth/profile providers, and client-side theme/lang sync. */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const validLocales = routing.locales as readonly string[];
  const locale = validLocales.includes(rawLocale) ? rawLocale : routing.defaultLocale;
  const defaultMessages = await getMessages({ locale: routing.defaultLocale });
  const localeMessages =
    locale === routing.defaultLocale ? defaultMessages : await getMessages({ locale });
  const messages = {
    ...defaultMessages,
    ...localeMessages,
  };

  return (
    <NuqsAdapter>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <HtmlLangSync lang={locale} />
        <AuthProvider>
          <ProfileProvider>
            {/* ThemeToggle syncs from data-theme after ThemeScript; avoid cookies() here. */}
            <Header initialTheme={DEFAULT_THEME} />
            {children}
            <Toaster />
          </ProfileProvider>
        </AuthProvider>
      </NextIntlClientProvider>
    </NuqsAdapter>
  );
}
