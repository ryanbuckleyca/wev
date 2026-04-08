/**
 * Centralized site base URL (e.g. https://bulletin.wevchange.org).
 * Set NEXT_PUBLIC_SITE_URL so auth redirects work correctly behind proxies
 * where request.url may have the wrong host (e.g. localhost).
 */

function normalizeConfiguredSiteUrl(configured: string | undefined): string | null {
  const trimmed = configured?.trim();
  if (!trimmed) return null;

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

/** Use in client components for auth redirect URLs (signup, forgot password). */
export function getSiteBaseUrl(): string {
  const configured = normalizeConfiguredSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

/** Use in server route handlers when you have the Request. */
export function getSiteBaseUrlFromRequest(request: Request): string {
  const configured = normalizeConfiguredSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;
  const { origin } = new URL(request.url);
  return origin;
}
