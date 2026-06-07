import { describe, it, expect } from 'vitest';
import { parseLocale } from './locale';

describe('locale utils', () => {
  it('parses french correctly', () => {
    expect(parseLocale('fr')).toBe('fr');
    expect(parseLocale('FR-CA')).toBe('fr');
    expect(parseLocale('  french  ')).toBe('fr');
  });

  it('defaults to english', () => {
    expect(parseLocale('en')).toBe('en');
    expect(parseLocale('de')).toBe('en');
    expect(parseLocale(null)).toBe('en');
    expect(parseLocale('')).toBe('en');
  });
});
