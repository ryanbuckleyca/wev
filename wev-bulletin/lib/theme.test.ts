import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, resolveThemeFromCookie } from '@/lib/theme';

describe('resolveThemeFromCookie', () => {
  it('returns explicit cookie values', () => {
    expect(resolveThemeFromCookie('light')).toBe('light');
    expect(resolveThemeFromCookie('dark')).toBe('dark');
  });

  it('defaults to dark when cookie is missing or unknown', () => {
    expect(resolveThemeFromCookie(undefined)).toBe(DEFAULT_THEME);
    expect(resolveThemeFromCookie('system')).toBe(DEFAULT_THEME);
  });
});
