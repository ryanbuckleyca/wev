/**
 * Centralized site base URL (e.g. https://bulletin.wevchange.org).
 * Set NEXT_PUBLIC_SITE_URL so auth redirects work correctly behind proxies
 * where request.url may have the wrong host (e.g. localhost).
 */

let hasWarnedInvalidConfiguredSiteUrl = false;

function warnInvalidConfiguredSiteUrl(configured: string): void {
  if (hasWarnedInvalidConfiguredSiteUrl) return;
  hasWarnedInvalidConfiguredSiteUrl = true;
  // Keep this as a plain warning so misconfiguration is visible in all runtimes.
  console.warn(
    `Invalid NEXT_PUBLIC_SITE_URL "${configured}". Falling back to request/window origin.`,
  );
}

function normalizeConfiguredSiteUrl(configured: string | undefined): string | null {
  const trimmed = configured?.trim();
  if (!trimmed) return null;

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withScheme).origin;
  } catch {
    warnInvalidConfiguredSiteUrl(trimmed);
    return null;
  }
}

/** Use in client components for auth redirect URLs (signup, forgot password). */
export function getSiteBaseUrl(): string {
  const configured = normalizeConfiguredSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;

  return '';
}

/** Use in server route handlers when you have the Request. */
export function getSiteBaseUrlFromRequest(request: Request): string {
  const configured = normalizeConfiguredSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;

  const { origin } = new URL(request.url);
  // Hardening: Resolve both localhost and 127.0.0.1 to localhost for session consistency.
  const { hostname, port } = new URL(origin);
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `http://localhost:${port || '3000'}`;
  }
  return origin;
}
