import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { hasSupabaseAuthCookie, isPublicCacheablePath } from './middleware';

describe('isPublicCacheablePath', () => {
  it('treats locale home and jobs aliases as public', () => {
    expect(isPublicCacheablePath('/')).toBe(true);
    expect(isPublicCacheablePath('/en')).toBe(true);
    expect(isPublicCacheablePath('/fr')).toBe(true);
    expect(isPublicCacheablePath('/en/jobs')).toBe(true);
    expect(isPublicCacheablePath('/fr/emplois')).toBe(true);
  });

  it('treats organization routes as public', () => {
    expect(isPublicCacheablePath('/en/organizations')).toBe(true);
    expect(isPublicCacheablePath('/fr/organizations/acme')).toBe(true);
  });

  it('keeps authenticated surfaces private', () => {
    expect(isPublicCacheablePath('/en/profile')).toBe(false);
    expect(isPublicCacheablePath('/en/bookmarks')).toBe(false);
    expect(isPublicCacheablePath('/en/admin/organizations')).toBe(false);
    expect(isPublicCacheablePath('/api/bulletin')).toBe(false);
    expect(isPublicCacheablePath('/api/ping')).toBe(false);
  });
});

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
