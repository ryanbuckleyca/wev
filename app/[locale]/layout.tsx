import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import Header from '@/components/Header'
import Toaster from '@/components/Toaster'
import { AuthProvider } from '@/contexts/AuthContext'
import LangSetter from '@/components/LangSetter'

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
    <NuqsAdapter>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <LangSetter locale={locale} />
        <AuthProvider>
          <Header />
          {children}
          <Toaster />
        </AuthProvider>
      </NextIntlClientProvider>
    </NuqsAdapter>
  )
}
