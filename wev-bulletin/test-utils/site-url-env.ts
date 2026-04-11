import { afterEach, beforeEach } from 'vitest';

/**
 * Saves and clears `NEXT_PUBLIC_SITE_URL` before each test, then restores the previous value after.
 * Call once inside a top-level `describe()` for route tests that exercise real `getSiteBaseUrlFromRequest`.
 *
 * Register this **before** other `beforeEach` hooks so subsequent hooks run with env already cleared
 * (Vitest runs `beforeEach` in registration order).
 */
export function resetNextPublicSiteUrlBetweenTests(): void {
  let previousSiteUrl: string | undefined;

  beforeEach(() => {
    previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  afterEach(() => {
    if (previousSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
    }
  });
}
