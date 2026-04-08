/**
 * Sanitizes the `next` query param for post-auth redirects so only in-app paths are
 * allowed (blocks http(s) URLs, protocol-relative URLs, and dangerous schemes like
 * `javascript:` / `data:`). Does not use a broad `includes('://')` check so query
 * strings containing `://` in a path remain valid.
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
  return t.startsWith('/') ? t : `/${t}`;
}
