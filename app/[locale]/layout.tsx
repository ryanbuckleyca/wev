import { cookies } from 'next/headers'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { Lexend_Deca } from 'next/font/google'
import Header from '@/components/Header'
import Toaster from '@/components/Toaster'
import { AuthProvider } from '@/contexts/AuthContext'
import { routing } from '@/i18n/routing'

const lexend = Lexend_Deca({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-lexend',
})

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale: rawLocale } = await params
  const validLocales = routing.locales as readonly string[]
  const locale = validLocales.includes(rawLocale) ? rawLocale : routing.defaultLocale
  const defaultMessages = await getMessages({ locale: routing.defaultLocale })
  const localeMessages =
    locale === routing.defaultLocale ? defaultMessages : await getMessages({ locale })
  const messages = {
    ...defaultMessages,
    ...localeMessages,
  }
  const cookieStore = await cookies()
  const theme = cookieStore.get('theme')?.value === 'dark' ? 'dark' : 'light'

  return (
    <html lang={locale} data-theme={theme} className={lexend.variable} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        {/* Blocking script to apply persisted theme before first paint on
            hard navigations (cookie may not be set on very first visit). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){/* ignore theme errors */}})()`,
          }}
        />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <NuqsAdapter>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <AuthProvider>
              <Header />
              {children}
              <Toaster />
            </AuthProvider>
          </NextIntlClientProvider>
        </NuqsAdapter>
      </body>
    </html>
  )
}
