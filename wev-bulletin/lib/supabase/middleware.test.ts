import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { hasSupabaseAuthCookie } from './middleware';

describe('hasSupabaseAuthCookie', () => {
  it('detects chunked and single auth cookies', () => {
    const withChunk = new NextRequest('http://localhost/en', {
      headers: { cookie: 'sb-abc-auth-token.0=x; theme=dark' },
    });
    const withSingle = new NextRequest('http://localhost/en', {
      headers: { cookie: 'sb-abc-auth-token=x' },
    });
    const anonymous = new NextRequest('http://localhost/en', {
      headers: { cookie: 'theme=dark' },
    });

    expect(hasSupabaseAuthCookie(withChunk)).toBe(true);
    expect(hasSupabaseAuthCookie(withSingle)).toBe(true);
    expect(hasSupabaseAuthCookie(anonymous)).toBe(false);
  });
});
