import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

/**
 * Integration: mocks only the Supabase server client (network boundary).
 * Exercises real `getSiteBaseUrlFromRequest` from `@/lib/site-url` with real env toggling.
 */
const mockExchangeCodeForSession = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const mockCreateClient = vi.mocked(createClient);

const REQUEST_ORIGIN = 'https://example.com';

describe('GET /auth/callback (integration)', () => {
  let previousSiteUrl: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockCreateClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: mockExchangeCodeForSession,
      },
    } as never);
  });

  afterEach(() => {
    if (previousSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
    }
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
