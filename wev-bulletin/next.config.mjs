import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';

/** Local Kong/API — browser traffic from public tunnel hostnames is rewritten here. */
const localSupabaseOrigin = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'http://127.0.0.1:54321'
).replace(/\/$/, '');

/** True for localhost and IPv4/IPv6 loopback hostnames. */
function isLoopbackHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** Whether the configured Supabase origin needs the local same-origin proxy rewrite. */
function shouldProxyLocalSupabase(origin) {
  try {
    return isLoopbackHostname(new URL(origin).hostname);
  } catch {
    return false;
  }
}

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
    // Only expose /__supabase when targeting loopback Supabase (local + tunnel).
    // Hosted deploys talk to supabase.co directly — no same-origin proxy needed.
    if (!shouldProxyLocalSupabase(localSupabaseOrigin)) {
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
