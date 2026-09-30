import { describe, it, expect } from 'vitest';
import {
  LOCAL_SUPABASE_PROXY_PREFIX,
  authCookieNameFromSupabaseUrl,
  resolveBrowserSupabaseUrl,
} from './browser-url';

describe('resolveBrowserSupabaseUrl', () => {
  it('returns the configured URL when there is no page location (SSR)', () => {
    expect(resolveBrowserSupabaseUrl('http://localhost:54321')).toBe('http://localhost:54321');
    expect(resolveBrowserSupabaseUrl('http://localhost:54321', null)).toBe(
      'http://localhost:54321',
    );
  });

  it('keeps loopback Supabase when the page is also loopback', () => {
    expect(
      resolveBrowserSupabaseUrl('http://localhost:54321', 'http://localhost:3000/en/login'),
    ).toBe('http://localhost:54321');
    expect(
      resolveBrowserSupabaseUrl('http://127.0.0.1:54321', 'http://127.0.0.1:3000/en/login'),
    ).toBe('http://127.0.0.1:54321');
  });

  it('proxies loopback Supabase when the page is a public tunnel hostname', () => {
    expect(
      resolveBrowserSupabaseUrl('http://localhost:54321', 'https://local.wevchange.org/en/login'),
    ).toBe(`https://local.wevchange.org${LOCAL_SUPABASE_PROXY_PREFIX}`);
  });

  it('leaves hosted Supabase URLs unchanged', () => {
    expect(
      resolveBrowserSupabaseUrl(
        'https://teuvfoftdjfsnkkbnzps.supabase.co',
        'https://local.wevchange.org/en/login',
      ),
    ).toBe('https://teuvfoftdjfsnkkbnzps.supabase.co');
  });
});

describe('authCookieNameFromSupabaseUrl', () => {
  it('derives the storage key from the configured hostname, not a proxy host', () => {
    expect(authCookieNameFromSupabaseUrl('http://localhost:54321')).toBe('sb-localhost-auth-token');
    expect(authCookieNameFromSupabaseUrl('https://teuvfoftdjfsnkkbnzps.supabase.co')).toBe(
      'sb-teuvfoftdjfsnkkbnzps-auth-token',
    );
  });

  it('falls back safely on invalid URLs', () => {
    expect(authCookieNameFromSupabaseUrl('not-a-url')).toBe('sb-localhost-auth-token');
  });
});
