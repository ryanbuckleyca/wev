import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'wev Bulletin - Job Postings',
  description: 'View and manage job postings from wev scraper',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
