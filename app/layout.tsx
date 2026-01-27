import type { Metadata } from 'next'
import { Lora, Source_Sans_3 } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import './globals.css'

const lora = Lora({ subsets: ['latin'], variable: '--font-lora' })
const sans = Source_Sans_3({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'WEV Bulletin - Job Postings',
  description: 'View and manage job postings from WEV scraper',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${lora.variable} ${sans.variable}`}>
      <body className="font-sans antialiased text-black">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
          }}
        />
      </body>
    </html>
  )
}
