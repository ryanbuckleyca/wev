/**
 * Shared helpers for the local `/__supabase` rewrite (next.config.mjs).
 * Kept as plain ESM so Next config and Vitest can both import it.
 */

/** True for localhost and IPv4/IPv6 loopback hostnames.
 * @param {string} hostname
 * @returns {boolean}
 */
export function isLoopbackHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/**
 * Whether browser traffic should use the same-origin `/__supabase` proxy.
 * Must match `resolveBrowserSupabaseUrl`, which keys off NEXT_PUBLIC_SUPABASE_URL.
 * @param {string | null | undefined} publicSupabaseUrl
 * @returns {boolean}
 */
export function shouldProxyLocalSupabase(publicSupabaseUrl) {
  if (!publicSupabaseUrl) return false;
  try {
    return isLoopbackHostname(new URL(publicSupabaseUrl).hostname);
  } catch {
    return false;
  }
}

/**
 * Server-reachable Kong/API origin for the rewrite destination.
 * Prefer SUPABASE_URL when it differs from the public loopback URL
 * (e.g. Docker host networking).
 * @param {{
 *   supabaseUrl?: string | null,
 *   publicSupabaseUrl?: string | null,
 *   fallback?: string,
 * }} [args]
 * @returns {string}
 */
export function localSupabaseRewriteDestination(args = {}) {
  const {
    supabaseUrl,
    publicSupabaseUrl,
    fallback = 'http://127.0.0.1:54321',
  } = args;
  const raw = supabaseUrl || publicSupabaseUrl || fallback;
  return String(raw).replace(/\/$/, '');
}
