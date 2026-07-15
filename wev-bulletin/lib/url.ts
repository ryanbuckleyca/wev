/**
 * Sanitizes a URL to prevent XSS attacks by ensuring only safe protocols are allowed.
 * Returns the URL if it's safe (http/https), or null if it's unsafe (javascript:, data:, etc).
 *
 * @param url - The URL to sanitize
 * @returns The sanitized URL or null if unsafe
 */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  const trimmed = url.trim();
  if (trimmed === '') return null;

  try {
    const parsed = new URL(trimmed);
    // Only allow http and https protocols
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null;
  } catch {
    // If URL parsing fails, check for dangerous patterns that might bypass validation
    const lowerUrl = trimmed.toLowerCase();
    if (
      lowerUrl.startsWith('javascript:') ||
      lowerUrl.startsWith('data:') ||
      lowerUrl.startsWith('vbscript:') ||
      lowerUrl.startsWith('file:')
    ) {
      return null;
    }

    // For malformed URLs without protocol, return null for safety
    // (unlike sanitizeUrl which allows relative URLs, safeUrl is strict for external links)
    return null;
  }
}

