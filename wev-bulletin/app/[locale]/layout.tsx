import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import Header from '@/components/Header';
import Toaster from '@/components/Toaster';
import HtmlLangSync from '@/components/HtmlLangSync';
import ThemeScript from '@/components/ThemeScript';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProfileProvider } from '@/contexts/ProfileContext';
import { routing } from '@/i18n/routing';

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
  const cookieStore = await cookies();
  // Default to dark mode if no cookie is set, matching ThemeScript fallback
  const theme = cookieStore.get('theme')?.value === 'light' ? 'light' : 'dark';

  return (
    <NuqsAdapter>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ThemeScript />
        <HtmlLangSync lang={locale} />
        <AuthProvider>
          <ProfileProvider>
            <Header initialTheme={theme} />
            {children}
            <Toaster />
          </ProfileProvider>
        </AuthProvider>
      </NextIntlClientProvider>
    </NuqsAdapter>
  );
}
