import { describe, expect, it } from 'vitest';
import { sanitizeNextPath } from './sanitize-next-path';

describe('sanitizeNextPath', () => {
  it('defaults null and empty to /', () => {
    expect(sanitizeNextPath(null)).toBe('/');
    expect(sanitizeNextPath('')).toBe('/');
    expect(sanitizeNextPath('   ')).toBe('/');
  });

  it('preserves locale-prefixed paths', () => {
    expect(sanitizeNextPath('/')).toBe('/');
    expect(sanitizeNextPath('/en/profile')).toBe('/en/profile');
    expect(sanitizeNextPath('/fr/emplois')).toBe('/fr/emplois');
  });

  it('normalizes missing leading slash when path is locale-prefixed', () => {
    expect(sanitizeNextPath('en/profile')).toBe('/en/profile');
    expect(sanitizeNextPath('fr/jobs')).toBe('/fr/jobs');
  });

  it('rejects paths without a locale prefix (same-origin path escape)', () => {
    expect(sanitizeNextPath('/profile')).toBe('/');
    expect(sanitizeNextPath('profile')).toBe('/');
    expect(sanitizeNextPath('/search')).toBe('/');
  });

  it('rejects absolute and protocol-relative URLs', () => {
    expect(sanitizeNextPath('https://evil.example/phish')).toBe('/');
    expect(sanitizeNextPath('http://evil.example/phish')).toBe('/');
    expect(sanitizeNextPath('//evil.example/phish')).toBe('/');
    expect(sanitizeNextPath('https://evil.example')).toBe('/');
  });

  it('rejects dangerous schemes', () => {
    expect(sanitizeNextPath('javascript:alert(1)')).toBe('/');
    expect(sanitizeNextPath('data:text/html,<script>')).toBe('/');
    expect(sanitizeNextPath('blob:https://x')).toBe('/');
  });

  it('allows query strings on locale paths (e.g. odd encoded substrings)', () => {
    expect(sanitizeNextPath('/en/search?q=a%3A%2F%2Fb')).toBe('/en/search?q=a%3A%2F%2Fb');
  });
});
