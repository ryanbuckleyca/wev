import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'teuvfoftdjfsnkkbnzps.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  reactStrictMode: true,
  // Removed 'output: export' to enable SSR/hybrid mode
  // This allows API routes and server-side rendering
  turbopack: {
    root: path.join(process.cwd(), '..'),
  },
  experimental: {
    externalDir: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
