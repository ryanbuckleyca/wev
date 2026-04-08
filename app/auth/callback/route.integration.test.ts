import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockCreateClient } from '@/test-utils/supabase-server-mock';
import { resetNextPublicSiteUrlBetweenTests } from '@/test-utils/site-url-env';
import { GET } from './route';

/**
 * Handler contract: mocks only the Supabase server client (network boundary).
 * Exercises real `getSiteBaseUrlFromRequest` from `@/lib/site-url` with real env toggling.
 *
 * Redirect expectations assert **current** concatenation of `base` + `next` from production.
 * They do **not** prove `next` is safe from open redirects — that belongs to product logic or dedicated security tests.
 */
const mockExchangeCodeForSession = vi.fn();

const REQUEST_ORIGIN = 'https://example.com';

describe('GET /auth/callback (handler contract)', () => {
  resetNextPublicSiteUrlBetweenTests();

  beforeEach(() => {
    vi.clearAllMocks();
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockCreateClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: mockExchangeCodeForSession,
      },
    } as never);
  });

  it('redirects using the request origin when NEXT_PUBLIC_SITE_URL is unset', async () => {
    const request = new Request(`${REQUEST_ORIGIN}/auth/callback?code=abc&next=%2Ffr%2Fprofile`);
    const response = await GET(request);

    expect(mockCreateClient).toHaveBeenCalled();
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe(`${REQUEST_ORIGIN}/fr/profile`);
  });

  it('uses NEXT_PUBLIC_SITE_URL for the redirect base when set', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://configured.example';

    const request = new Request('http://localhost:3000/auth/callback?code=abc&next=%2Fen%2Fjobs');
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe('https://configured.example/en/jobs');
  });

  it('defaults next to / when omitted', async () => {
    const request = new Request(`${REQUEST_ORIGIN}/auth/callback?code=xyz`);
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe(`${REQUEST_ORIGIN}/`);
  });

  it('redirects to auth-code-error when there is no code', async () => {
    const request = new Request(`${REQUEST_ORIGIN}/auth/callback`);
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe(`${REQUEST_ORIGIN}/auth/auth-code-error`);
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('redirects to auth-code-error when exchangeCodeForSession fails', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: { message: 'invalid' } });

    const request = new Request(`${REQUEST_ORIGIN}/auth/callback?code=bad`);
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe(`${REQUEST_ORIGIN}/auth/auth-code-error`);
  });
});
