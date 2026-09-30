import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';
import {
  localSupabaseRewriteDestination,
  shouldProxyLocalSupabase,
} from './lib/supabase/local-proxy.mjs';

/** Server-reachable Kong/API origin used as the `/__supabase` rewrite target. */
const localSupabaseOrigin = localSupabaseRewriteDestination({
  supabaseUrl: process.env.SUPABASE_URL,
  publicSupabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
});

/** Browser-facing Supabase URL — eligibility must match resolveBrowserSupabaseUrl. */
const publicSupabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');

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
  output: 'standalone',
  serverExternalPackages: ['pdfjs-dist', 'mammoth'],
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
  async rewrites() {
    // Gate on the public URL (what the browser client uses). Destination may
    // still be SUPABASE_URL when that differs from loopback for the Node process.
    if (!shouldProxyLocalSupabase(publicSupabaseUrl)) {
      return [];
    }
    return [
      {
        source: '/__supabase/:path*',
        destination: `${localSupabaseOrigin}/:path*`,
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
