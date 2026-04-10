import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockCreateClient } from '@/test-utils/supabase-server-mock';
import { resetNextPublicSiteUrlBetweenTests } from '@/test-utils/site-url-env';
import { POST } from './route';

/**
 * Handler contract: mocks only `createClient`. Real `getSiteBaseUrlFromRequest` + env behavior.
 */
const mockSignOut = vi.fn();

const REQUEST_ORIGIN = 'https://example.com';

describe('POST /auth/signout (handler contract)', () => {
  resetNextPublicSiteUrlBetweenTests();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue({ error: null });
    mockCreateClient.mockResolvedValue({
      auth: {
        signOut: mockSignOut,
      },
    } as never);
  });

  it('signs out and redirects to /login using the request origin', async () => {
    const request = new Request(`${REQUEST_ORIGIN}/auth/signout`, { method: 'POST' });
    const response = await POST(request);

    expect(mockSignOut).toHaveBeenCalled();
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(`${REQUEST_ORIGIN}/login`);
  });

  it('uses NEXT_PUBLIC_SITE_URL for the redirect base when set', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://configured.example';

    const request = new Request('http://localhost:3000/auth/signout', { method: 'POST' });
    const response = await POST(request);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://configured.example/login');
  });

  it('normalizes NEXT_PUBLIC_SITE_URL before redirecting', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = '  https://configured.example/en  ';

    const request = new Request('http://localhost:3000/auth/signout', { method: 'POST' });
    const response = await POST(request);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://configured.example/login');
  });
});
