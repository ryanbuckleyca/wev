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
import { UnsavedChangesProvider } from '@/contexts/UnsavedChangesContext';
import { routing } from '@/i18n/routing';
import { resolveThemeFromCookie } from '@/lib/theme';

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
  const theme = resolveThemeFromCookie(cookieStore.get('theme')?.value);

  return (
    <NuqsAdapter>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ThemeScript />
        <HtmlLangSync lang={locale} />
        <AuthProvider>
          <ProfileProvider>
            <UnsavedChangesProvider>
              <Header initialTheme={theme} />
              {children}
              <Toaster />
            </UnsavedChangesProvider>
          </ProfileProvider>
        </AuthProvider>
      </NextIntlClientProvider>
    </NuqsAdapter>
  );
}
