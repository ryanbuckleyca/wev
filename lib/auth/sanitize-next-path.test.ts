import { describe, expect, it } from 'vitest';
import { sanitizeNextPath } from './sanitize-next-path';

describe('sanitizeNextPath', () => {
  it('defaults null and empty to /', () => {
    expect(sanitizeNextPath(null)).toBe('/');
    expect(sanitizeNextPath('')).toBe('/');
    expect(sanitizeNextPath('   ')).toBe('/');
  });

  it('preserves safe relative paths', () => {
    expect(sanitizeNextPath('/')).toBe('/');
    expect(sanitizeNextPath('/en/profile')).toBe('/en/profile');
    expect(sanitizeNextPath('/fr/jobs')).toBe('/fr/jobs');
  });

  it('adds a leading slash when missing', () => {
    expect(sanitizeNextPath('profile')).toBe('/profile');
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

  it('allows paths whose query contains a substring like ://', () => {
    expect(sanitizeNextPath('/search?q=a%3A%2F%2Fb')).toBe('/search?q=a%3A%2F%2Fb');
  });
});
