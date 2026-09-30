/**
 * Path prefix for same-origin proxying of the local Supabase API.
 * Must match the rewrite in `next.config.mjs`.
 */
export const LOCAL_SUPABASE_PROXY_PREFIX = '/__supabase';

/** True for localhost and IPv4/IPv6 loopback hostnames. */
function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/**
 * Auth cookie / storage key name matching `@supabase/supabase-js` default:
 * `sb-${hostname.split('.')[0]}-auth-token` from the *configured* project URL.
 *
 * When browser requests go through `LOCAL_SUPABASE_PROXY_PREFIX`, the request URL
 * hostname is the tunnel host — we must still name cookies from the configured
 * Supabase URL so they match server/middleware clients.
 */
export function authCookieNameFromSupabaseUrl(configuredUrl: string): string {
  try {
    const hostname = new URL(configuredUrl).hostname;
    return `sb-${hostname.split('.')[0] || 'localhost'}-auth-token`;
  } catch {
    return 'sb-localhost-auth-token';
  }
}

/**
 * Browser Supabase base URL.
 *
 * When the page is served from a public hostname (e.g. `https://local.wevchange.org`
 * via Cloudflare tunnel) but `NEXT_PUBLIC_SUPABASE_URL` points at loopback
 * (`http://localhost:54321`), private/incognito browsers block the fetch
 * (Private Network Access). Proxy through the Next app so auth stays same-origin.
 *
 * Server-side callers should keep using `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`
 * directly — Node can reach loopback without that restriction.
 */
export function resolveBrowserSupabaseUrl(configuredUrl: string, pageHref?: string | null): string {
  if (!pageHref) return configuredUrl;

  try {
    const configured = new URL(configuredUrl);
    const page = new URL(pageHref);
    if (isLoopbackHostname(configured.hostname) && !isLoopbackHostname(page.hostname)) {
      return `${page.origin}${LOCAL_SUPABASE_PROXY_PREFIX}`;
    }
  } catch {
    return configuredUrl;
  }

  return configuredUrl;
}
