export const truncateMiddle = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  const half = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(value.length - half)}`;
};

/**
 * Sanitizes a URL to prevent XSS attacks by ensuring only safe protocols are allowed.
 * Returns the URL if it's safe (http/https), or null if it's unsafe (javascript:, data:, etc).
 *
 * @param url - The URL to sanitize
 * @returns The sanitized URL or null if unsafe
 */
export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  const trimmed = url.trim();
  if (trimmed === '') return null;

  try {
    // Handle relative URLs (assume safe)
    if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
      return trimmed;
    }

    // Handle protocol-relative URLs (//example.com)
    if (trimmed.startsWith('//')) {
      return trimmed;
    }

    // Check for explicit protocol
    const urlObj = new URL(trimmed);
    const protocol = urlObj.protocol.toLowerCase();

    // Only allow http, https, and mailto protocols
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') {
      return trimmed;
    }

    // Reject dangerous protocols like javascript:, data:, vbscript:, file:
    return null;
  } catch {
    // If URL parsing fails, assume it's a relative URL or malformed
    // Check for dangerous patterns in case URL constructor didn't catch them
    const lowerUrl = trimmed.toLowerCase();
    if (
      lowerUrl.startsWith('javascript:') ||
      lowerUrl.startsWith('data:') ||
      lowerUrl.startsWith('vbscript:') ||
      lowerUrl.startsWith('file:')
    ) {
      return null;
    }

    // If it looks like it might be a domain without protocol, return it
    // (browsers will treat it as a relative URL or the browser will add protocol)
    return trimmed;
  }
}
