/**
 * Extracts and normalizes URLs from email content.
 * Handles quoted-printable encoding and HTML entities.
 */

const EMAIL_SOFT_WRAP_PATTERN = /=\r?\n/g;
const HREF_PATTERN = /href=(?:"|')([^"']+)(?:"|')/gi;
const PLAIN_URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;
const TRAILING_PUNCTUATION = /[.,;!?)]$/;

export class EmailUrlExtractor {
  /**
   * Extract the best matching URL from email content based on a hint.
   */
  extractMatchingUrl(emailContent: string, linkHint: string): string | null {
    const normalizedContent = this.normalizeEmailText(emailContent);
    const urls = this.findAllUrls(normalizedContent);
    return this.findBestMatch(urls, linkHint);
  }

  /**
   * Normalize email text by removing quoted-printable soft line breaks.
   */
  private normalizeEmailText(text: string): string {
    return text.replace(EMAIL_SOFT_WRAP_PATTERN, "");
  }

  /**
   * Extract all URLs from email content (both href attributes and plain text).
   */
  private findAllUrls(normalizedContent: string): string[] {
    const hrefUrls = this.extractHrefUrls(normalizedContent);
    const plainUrls = this.extractPlainUrls(normalizedContent);

    const allUrls = [...hrefUrls, ...plainUrls];
    return allUrls.map((url) => this.normalizeUrl(url));
  }

  /**
   * Extract URLs from href attributes in HTML.
   */
  private extractHrefUrls(content: string): string[] {
    const matches = Array.from(content.matchAll(HREF_PATTERN));
    return matches.map((match) => match[1]);
  }

  /**
   * Extract plain text URLs.
   */
  private extractPlainUrls(content: string): string[] {
    return content.match(PLAIN_URL_PATTERN) ?? [];
  }

  /**
   * Normalize a URL by removing HTML entities and quoted-printable artifacts.
   */
  private normalizeUrl(url: string): string {
    return url
      .replaceAll("&amp;", "&")
      .replaceAll("=\r\n", "")
      .replaceAll("=\n", "")
      .replace(TRAILING_PUNCTUATION, "");
  }

  /**
   * Find the best matching URL from candidates based on hint.
   */
  private findBestMatch(urls: string[], hint: string): string | null {
    const normalizedHint = hint.toLowerCase();
    const candidates = urls.filter((url) =>
      url.toLowerCase().includes(normalizedHint),
    );

    if (candidates.length === 0) return null;

    // For auth callback hints, prefer the signed verify URL over plain callback
    const preferred = this.findPreferredAuthUrl(candidates, normalizedHint);
    if (preferred) return preferred;

    // Otherwise, return the longest URL (most specific)
    return this.findLongestUrl(candidates);
  }

  /**
   * Find preferred auth verification URL if hint is for auth callback.
   */
  private findPreferredAuthUrl(
    candidates: string[],
    hint: string,
  ): string | null {
    if (!hint.includes("/auth/callback")) return null;

    return (
      candidates.find((url) => {
        const lower = url.toLowerCase();
        return (
          lower.includes("/auth/v1/verify") &&
          lower.includes("token=") &&
          lower.includes("redirect_to=")
        );
      }) ?? null
    );
  }

  /**
   * Find the longest URL from candidates.
   */
  private findLongestUrl(candidates: string[]): string {
    return [...candidates].sort((a, b) => b.length - a.length)[0];
  }
}
