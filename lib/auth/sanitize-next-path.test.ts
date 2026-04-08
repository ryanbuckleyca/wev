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
});
