import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

/**
 * Integration: mocks only `createClient`. Real `getSiteBaseUrlFromRequest` + env behavior.
 */
const mockSignOut = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const mockCreateClient = vi.mocked(createClient);

const REQUEST_ORIGIN = 'https://example.com';

describe('POST /auth/signout (integration)', () => {
  let previousSiteUrl: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    mockSignOut.mockResolvedValue({ error: null });
    mockCreateClient.mockResolvedValue({
      auth: {
        signOut: mockSignOut,
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
});
