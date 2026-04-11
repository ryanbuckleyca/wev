import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSiteBaseUrl, getSiteBaseUrlFromRequest } from '@/lib/site-url';

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (ORIGINAL_SITE_URL === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    return;
  }
  process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
});

describe('getSiteBaseUrl', () => {
  it('returns normalized configured origin when value includes spaces and path', () => {
    process.env.NEXT_PUBLIC_SITE_URL = '  https://bulletin.wevchange.org/en  ';

    expect(getSiteBaseUrl()).toBe('https://bulletin.wevchange.org');
  });

  it('supports configured host without a scheme', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'bulletin.wevchange.org/en';

    expect(getSiteBaseUrl()).toBe('https://bulletin.wevchange.org');
  });
});

describe('getSiteBaseUrlFromRequest', () => {
  it('falls back to request origin when configured value is invalid', () => {
    process.env.NEXT_PUBLIC_SITE_URL = ':// definitely-not-a-url';
    const request = new Request('http://localhost:3000/auth/signout', { method: 'POST' });

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getSiteBaseUrlFromRequest(request)).toBe('http://localhost:3000');
    consoleSpy.mockRestore();
  });
});
