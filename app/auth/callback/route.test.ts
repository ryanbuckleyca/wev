import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('/auth/callback GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it('redirects to auth-code-error when there is no code', async () => {
    const request = new Request('https://example.com/auth/callback');
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe('https://example.com/auth/auth-code-error');
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('exchanges the code and redirects to the site base plus next', async () => {
    const request = new Request(
      'https://example.com/auth/callback?code=abc&next=%2Ffr%2Fprofile',
    );
    const response = await GET(request);

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe('https://example.com/fr/profile');
  });

  it('defaults next to / when omitted', async () => {
    const request = new Request('https://example.com/auth/callback?code=xyz');
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe('https://example.com/');
  });

  it('redirects to auth-code-error when exchangeCodeForSession fails', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: { message: 'invalid' } });

    const request = new Request('https://example.com/auth/callback?code=bad');
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe('https://example.com/auth/auth-code-error');
  });
});
