import { routing } from '@/i18n/routing';

/**
 * Sanitizes the `next` query param for post-auth redirects.
 *
 * - Blocks http(s) URLs, protocol-relative URLs, and dangerous schemes (`javascript:`,
 *   `data:`, etc.).
 * - Restricts paths to `/` or locale-prefixed routes (`/en/...`, `/fr/...`) matching
 *   `localePrefix: 'always'` in `i18n/routing`.
 */
export function sanitizeNextPath(next: string | null): string {
  if (next == null) {
    return '/';
  }
  const t = next.trim();
  if (t === '' || t === '/') {
    return '/';
  }
  if (/^https?:\/\//i.test(t) || t.startsWith('//')) {
    return '/';
  }
  if (/^(javascript|data|blob|vbscript):/i.test(t)) {
    return '/';
  }

  const normalized = t.startsWith('/') ? t : `/${t}`;
  const pathname = normalized.split('?')[0].split('#')[0] ?? '';

  if (!isLocalePrefixedAppPath(pathname)) {
    return '/';
  }

  return normalized;
}

function isLocalePrefixedAppPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '') {
    return true;
  }
  return routing.locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
}
