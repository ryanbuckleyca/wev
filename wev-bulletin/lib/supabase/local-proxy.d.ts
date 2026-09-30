/** True for localhost and IPv4/IPv6 loopback hostnames. */
export function isLoopbackHostname(hostname: string): boolean;

/**
 * Whether browser traffic should use the same-origin `/__supabase` proxy.
 * Must match `resolveBrowserSupabaseUrl`, which keys off NEXT_PUBLIC_SUPABASE_URL.
 */
export function shouldProxyLocalSupabase(publicSupabaseUrl?: string | null): boolean;

export type LocalSupabaseRewriteDestinationArgs = {
  supabaseUrl?: string | null;
  publicSupabaseUrl?: string | null;
  fallback?: string;
};

/**
 * Server-reachable Kong/API origin for the rewrite destination.
 * Prefer SUPABASE_URL when it differs from the public loopback URL.
 */
export function localSupabaseRewriteDestination(
  args?: LocalSupabaseRewriteDestinationArgs,
): string;
