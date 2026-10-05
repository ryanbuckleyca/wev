import { describe, expect, it, afterEach, vi } from 'vitest';
import { hasSupabaseAuthCookieInBrowser, isSupabaseAuthCookieName } from './auth-cookie';

describe('isSupabaseAuthCookieName', () => {
  it('matches single and chunked auth cookies', () => {
    expect(isSupabaseAuthCookieName('sb-abc-auth-token')).toBe(true);
    expect(isSupabaseAuthCookieName('sb-abc-auth-token.0')).toBe(true);
    expect(isSupabaseAuthCookieName('theme')).toBe(false);
    expect(isSupabaseAuthCookieName('sb-abc-other')).toBe(false);
  });
});

describe('hasSupabaseAuthCookieInBrowser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false when document is unavailable', () => {
    vi.stubGlobal('document', undefined);
    expect(hasSupabaseAuthCookieInBrowser()).toBe(false);
  });

  it('reads document.cookie', () => {
    vi.stubGlobal('document', { cookie: 'theme=dark; sb-xyz-auth-token.0=abc' });
    expect(hasSupabaseAuthCookieInBrowser()).toBe(true);

    vi.stubGlobal('document', { cookie: 'theme=dark' });
    expect(hasSupabaseAuthCookieInBrowser()).toBe(false);
  });
});
