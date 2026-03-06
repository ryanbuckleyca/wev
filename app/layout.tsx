import type { Metadata } from 'next'
import { Lexend_Deca } from 'next/font/google'
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
      <body className="theme-transition font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
