import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import Script from 'next/script';
import { getSiteBaseUrl } from '@/lib/site-url';
import { resolveThemeFromCookie } from '@/lib/theme';
import { routing } from '@/i18n/routing';
import { Lexend_Deca } from 'next/font/google';
import './globals.css';

const siteBaseUrl = getSiteBaseUrl() || 'https://bulletin.wevchange.org';
const lexend = Lexend_Deca({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-lexend',
});

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
const isProduction = process.env.NODE_ENV === 'production';
const enableAnalytics = Boolean(GA_ID && isProduction);

export const metadata: Metadata = {
  title: 'wev Bulletin - Job Postings',
  description: 'View and manage job postings from wev scraper',
  metadataBase: new URL(siteBaseUrl),
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const cookieStore = await cookies();

  const rawLocale = headerStore.get('x-next-intl-locale');
  const validLocales = routing.locales as readonly string[];
  const locale = rawLocale && validLocales.includes(rawLocale) ? rawLocale : routing.defaultLocale;
  const theme = resolveThemeFromCookie(cookieStore.get('theme')?.value);

  return (
    <html lang={locale} data-theme={theme} className={lexend.variable} suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {children}
        {enableAnalytics && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}');
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
