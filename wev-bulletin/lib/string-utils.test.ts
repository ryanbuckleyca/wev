import { describe, it, expect } from 'vitest';
import { truncateMiddle, sanitizeUrl } from './string-utils';

describe('string-utils', () => {
  describe('truncateMiddle', () => {
    it('returns original string if shorter than maxLength', () => {
      expect(truncateMiddle('test', 10)).toBe('test');
    });

    it('truncates middle if longer than maxLength', () => {
      // maxLength 5, half = floor(4/2) = 2
      // expect "te…st" (2 chars + … + 2 chars = 5 chars)
      expect(truncateMiddle('teststring', 5)).toBe('te…ng');
    });

    it('handles exact length', () => {
      expect(truncateMiddle('test', 4)).toBe('test');
    });
  });

  describe('sanitizeUrl', () => {
    describe('safe URLs', () => {
      it('allows https URLs', () => {
        expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
        expect(sanitizeUrl('https://example.com/path?query=value')).toBe(
          'https://example.com/path?query=value',
        );
      });

      it('allows http URLs', () => {
        expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
      });

      it('allows mailto URLs', () => {
        expect(sanitizeUrl('mailto:user@example.com')).toBe('mailto:user@example.com');
      });

      it('allows relative URLs', () => {
        expect(sanitizeUrl('/path/to/page')).toBe('/path/to/page');
        expect(sanitizeUrl('./relative')).toBe('./relative');
        expect(sanitizeUrl('../parent')).toBe('../parent');
      });

      it('allows protocol-relative URLs', () => {
        expect(sanitizeUrl('//example.com')).toBe('//example.com');
      });

      it('handles URLs with whitespace', () => {
        expect(sanitizeUrl('  https://example.com  ')).toBe('https://example.com');
      });
    });

    describe('unsafe URLs (XSS vectors)', () => {
      it('blocks javascript: protocol', () => {
        expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
        expect(sanitizeUrl('JavaScript:alert(1)')).toBeNull();
        expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBeNull();
      });

      it('blocks data: protocol', () => {
        expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
        expect(sanitizeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBeNull();
      });

      it('blocks vbscript: protocol', () => {
        expect(sanitizeUrl('vbscript:msgbox(1)')).toBeNull();
      });

      it('blocks file: protocol', () => {
        expect(sanitizeUrl('file:///etc/passwd')).toBeNull();
      });

      it('blocks other dangerous protocols', () => {
        expect(sanitizeUrl('ftp://example.com')).toBeNull();
      });
    });

    describe('edge cases', () => {
      it('returns null for null input', () => {
        expect(sanitizeUrl(null)).toBeNull();
      });

      it('returns null for undefined input', () => {
        expect(sanitizeUrl(undefined)).toBeNull();
      });

      it('returns null for empty string', () => {
        expect(sanitizeUrl('')).toBeNull();
        expect(sanitizeUrl('   ')).toBeNull();
      });

      it('handles malformed URLs without protocol', () => {
        // Domain-like strings without protocol are treated as relative URLs
        const result = sanitizeUrl('example.com');
        expect(result).toBe('example.com');
      });
    });
  });
});
