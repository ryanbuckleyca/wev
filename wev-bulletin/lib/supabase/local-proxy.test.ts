import { describe, it, expect } from 'vitest';
import { localSupabaseRewriteDestination, shouldProxyLocalSupabase } from './local-proxy.mjs';

describe('shouldProxyLocalSupabase', () => {
  it('enables the proxy when NEXT_PUBLIC_SUPABASE_URL is loopback', () => {
    expect(shouldProxyLocalSupabase('http://localhost:54321')).toBe(true);
    expect(shouldProxyLocalSupabase('http://127.0.0.1:54321')).toBe(true);
  });

  it('disables the proxy for hosted Supabase URLs', () => {
    expect(shouldProxyLocalSupabase('https://teuvfoftdjfsnkkbnzps.supabase.co')).toBe(false);
  });

  it('disables the proxy when the public URL is missing or invalid', () => {
    expect(shouldProxyLocalSupabase('')).toBe(false);
    expect(shouldProxyLocalSupabase(undefined)).toBe(false);
    expect(shouldProxyLocalSupabase('not-a-url')).toBe(false);
  });
});

describe('localSupabaseRewriteDestination', () => {
  it('prefers SUPABASE_URL for the rewrite target', () => {
    expect(
      localSupabaseRewriteDestination({
        supabaseUrl: 'http://host.docker.internal:54321',
        publicSupabaseUrl: 'http://localhost:54321',
      }),
    ).toBe('http://host.docker.internal:54321');
  });

  it('falls back to the public URL, then loopback', () => {
    expect(
      localSupabaseRewriteDestination({
        publicSupabaseUrl: 'http://localhost:54321/',
      }),
    ).toBe('http://localhost:54321');
    expect(localSupabaseRewriteDestination({})).toBe('http://127.0.0.1:54321');
  });
});

describe('public eligibility vs server destination', () => {
  it('keeps proxying when public URL is loopback but SUPABASE_URL is not', () => {
    const publicUrl = 'http://localhost:54321';
    const serverUrl = 'http://host.docker.internal:54321';

    expect(shouldProxyLocalSupabase(publicUrl)).toBe(true);
    expect(
      localSupabaseRewriteDestination({
        supabaseUrl: serverUrl,
        publicSupabaseUrl: publicUrl,
      }),
    ).toBe(serverUrl);
  });
});
