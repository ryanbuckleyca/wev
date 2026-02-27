import type { Metadata } from 'next'
import { Lexend_Deca } from 'next/font/google'
import Header from '@/components/Header'
import Toaster from '@/components/Toaster'
import { AuthProvider } from '@/contexts/AuthContext'
import './globals.css'

const lexend = Lexend_Deca({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-lexend',
})

export const metadata: Metadata = {
  title: 'wev Bulletin - Job Postings',
  description: 'View and manage job postings from wev scraper',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={lexend.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme')||'light';document.documentElement.setAttribute('data-theme',t);})();`,
          }}
        />
      </head>
      <body className="theme-transition font-sans antialiased">
        <AuthProvider>
          <Header />
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  )
}
