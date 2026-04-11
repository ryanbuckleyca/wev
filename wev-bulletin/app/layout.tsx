import type { Metadata } from 'next';
import { getSiteBaseUrl } from '@/lib/site-url';
import './globals.css';

const siteBaseUrl = getSiteBaseUrl() || 'https://bulletin.wevchange.org';

export const metadata: Metadata = {
  title: 'wev Bulletin - Job Postings',
  description: 'View and manage job postings from wev scraper',
  metadataBase: new URL(siteBaseUrl),
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
