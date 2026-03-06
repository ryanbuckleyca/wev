import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { Lexend_Deca } from 'next/font/google'
import Header from '@/components/Header'
import Toaster from '@/components/Toaster'
import { AuthProvider } from '@/contexts/AuthContext'

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
  const { locale } = await params
  const messages = await getMessages({locale})

  return (
    <html lang={locale} className={lexend.variable} suppressHydrationWarning>
      <body className="theme-transition font-sans antialiased" suppressHydrationWarning>
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
