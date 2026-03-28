import path from 'path';
import createNextIntlPlugin from 'next-intl/plugin';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '..', '.env') });
// Also try loading from current directory as fallback
config({ path: path.join(process.cwd(), '.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Removed 'output: export' to enable SSR/hybrid mode
  // This allows API routes and server-side rendering
  turbopack: {
    root: process.cwd(),
  },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
