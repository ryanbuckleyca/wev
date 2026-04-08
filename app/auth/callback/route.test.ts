import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

const mockExchangeCodeForSession = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  })),
}));

vi.mock('@/lib/site-url', () => ({
  getSiteBaseUrlFromRequest: vi.fn(() => 'https://example.com'),
}));

const mockCreateClient = vi.mocked(createClient);

const BASE = 'https://example.com';

function expectRedirect(response: Response, location: string) {
  expect(response.status).toBe(307);
  expect(response.headers.get('Location')).toBe(location);
}

describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it('redirects to auth-code-error when there is no code', async () => {
    const request = new Request(`${BASE}/auth/callback`);
    const response = await GET(request);

    expectRedirect(response, `${BASE}/auth/auth-code-error`);
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('redirects to auth-code-error when code is empty', async () => {
    const request = new Request(`${BASE}/auth/callback?code=`);
    const response = await GET(request);

    expectRedirect(response, `${BASE}/auth/auth-code-error`);
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('exchanges the code and redirects to the site base plus next', async () => {
    const request = new Request(`${BASE}/auth/callback?code=abc&next=%2Ffr%2Fprofile`);
    const response = await GET(request);

    expect(mockCreateClient).toHaveBeenCalled();
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc');
    expectRedirect(response, `${BASE}/fr/profile`);
  });

  it('defaults next to / when omitted', async () => {
    const request = new Request(`${BASE}/auth/callback?code=xyz`);
    const response = await GET(request);

    expectRedirect(response, `${BASE}/`);
  });

  it('redirects to home when next is an absolute URL (open-redirect guard)', async () => {
    const request = new Request(
      `${BASE}/auth/callback?code=abc&next=https%3A%2F%2Fevil.example%2Fphish`,
    );
    const response = await GET(request);

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc');
    expectRedirect(response, `${BASE}/`);
  });

  it('redirects to home when next is protocol-relative', async () => {
    const request = new Request(
      `${BASE}/auth/callback?code=abc&next=%2F%2Fevil.example%2F`,
    );
    const response = await GET(request);

    expectRedirect(response, `${BASE}/`);
  });

  it('redirects to home when next uses a javascript: URL', async () => {
    const request = new Request(
      `${BASE}/auth/callback?code=abc&next=javascript%3Aalert(1)`,
    );
    const response = await GET(request);

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc');
    expectRedirect(response, `${BASE}/`);
  });

  it('redirects to auth-code-error when exchangeCodeForSession fails', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: { message: 'invalid' } });

    const request = new Request(`${BASE}/auth/callback?code=bad`);
    const response = await GET(request);

    expectRedirect(response, `${BASE}/auth/auth-code-error`);
  });
});
