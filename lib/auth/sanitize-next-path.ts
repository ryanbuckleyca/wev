/**
 * Sanitizes the `next` query param for post-auth redirects so only same-origin
 * path redirects are allowed (blocks absolute URLs and protocol-relative URLs).
 */
export function sanitizeNextPath(next: string | null): string {
  if (next == null) {
    return '/';
  }
  const t = next.trim();
  if (t === '' || t === '/') {
    return '/';
  }
  if (/^https?:\/\//i.test(t) || t.startsWith('//') || t.includes('://')) {
    return '/';
  }
  return t.startsWith('/') ? t : `/${t}`;
}
