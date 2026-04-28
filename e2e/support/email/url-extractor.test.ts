import { describe, it, expect } from "vitest";
import { EmailUrlExtractor } from "./url-extractor";

describe("EmailUrlExtractor", () => {
  const extractor = new EmailUrlExtractor();

  describe("extractMatchingUrl", () => {
    it("extracts plain text URLs", () => {
      const content = "Click here: https://example.com/verify?token=abc123";
      const result = extractor.extractMatchingUrl(content, "verify");

      expect(result).toBe("https://example.com/verify?token=abc123");
    });

    it("extracts URLs from href attributes", () => {
      const content = '<a href="https://example.com/reset">Reset Password</a>';
      const result = extractor.extractMatchingUrl(content, "reset");

      expect(result).toBe("https://example.com/reset");
    });

    it("handles quoted-printable soft line breaks", () => {
      const content =
        "https://example.com/very-long-url?token=abc=\n123&redirect=home";
      const result = extractor.extractMatchingUrl(content, "token");

      expect(result).toBe(
        "https://example.com/very-long-url?token=abc123&redirect=home",
      );
    });

    it("decodes HTML entities", () => {
      const content = '<a href="https://example.com?foo=1&amp;bar=2">Link</a>';
      const result = extractor.extractMatchingUrl(content, "example");

      expect(result).toBe("https://example.com?foo=1&bar=2");
    });

    it("removes trailing punctuation", () => {
      const content = "Visit https://example.com/page.";
      const result = extractor.extractMatchingUrl(content, "page");

      expect(result).toBe("https://example.com/page");
    });

    it("returns null when no URLs match hint", () => {
      const content = "https://example.com/foo https://example.com/bar";
      const result = extractor.extractMatchingUrl(content, "baz");

      expect(result).toBeNull();
    });

    it("returns null when no URLs present", () => {
      const content = "This is just plain text with no links";
      const result = extractor.extractMatchingUrl(content, "link");

      expect(result).toBeNull();
    });

    it("prefers auth verify URLs over plain callback URLs", () => {
      const content = `
        <a href="https://example.com/auth/callback">Callback</a>
        <a href="https://example.com/auth/v1/verify?token=xyz&redirect_to=https://example.com/auth/callback">Verify</a>
      `;
      const result = extractor.extractMatchingUrl(content, "/auth/callback");

      expect(result).toContain("/auth/v1/verify");
      expect(result).toContain("token=");
      expect(result).toContain("redirect_to=");
    });

    it("returns longest URL when multiple matches and no preference", () => {
      const content = `
        https://example.com/short
        https://example.com/much-longer-url-with-params?foo=bar&baz=qux
        https://example.com/medium-length
      `;
      const result = extractor.extractMatchingUrl(content, "example");

      expect(result).toBe(
        "https://example.com/much-longer-url-with-params?foo=bar&baz=qux",
      );
    });

    it("handles mixed single and double quotes in href", () => {
      const content = `
        <a href='https://example.com/single'>Single</a>
        <a href="https://example.com/double">Double</a>
      `;
      const result = extractor.extractMatchingUrl(content, "single");

      expect(result).toBe("https://example.com/single");
    });

    it("handles malformed HTML gracefully", () => {
      const content = '<a href="https://example.com/test>Missing closing quote';
      const result = extractor.extractMatchingUrl(content, "test");

      // Should still extract the plain text URL
      expect(result).toContain("example.com");
    });

    it("is case-insensitive for hint matching", () => {
      const content = "https://example.com/VERIFY?TOKEN=ABC";
      const result = extractor.extractMatchingUrl(content, "verify");

      expect(result).toBeTruthy();
      expect(result).toContain("VERIFY");
    });

    it("handles CRLF line endings", () => {
      const content = "https://example.com/url?token=abc=\r\n123";
      const result = extractor.extractMatchingUrl(content, "token");

      expect(result).toBe("https://example.com/url?token=abc123");
    });

    it("handles multiple quoted-printable breaks in same URL", () => {
      const content = "https://example.com/path?a=1=\n&b=2=\n&c=3";
      const result = extractor.extractMatchingUrl(content, "path");

      expect(result).toBe("https://example.com/path?a=1&b=2&c=3");
    });

    it("extracts from email body with multiple URLs", () => {
      const content = `
        Welcome! Here are your links:
        Dashboard: https://example.com/dashboard
        Verify Email: https://example.com/verify?token=abc123
        Support: https://example.com/support
      `;
      const result = extractor.extractMatchingUrl(content, "verify");

      expect(result).toBe("https://example.com/verify?token=abc123");
    });
  });
});
