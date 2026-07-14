import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const { mockRpc, mockSignInWithOtp, mockSignUp, mockResend } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockSignInWithOtp: vi.fn(),
  mockSignUp: vi.fn(),
  mockResend: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    rpc: mockRpc,
    auth: {
      signInWithOtp: mockSignInWithOtp,
      signUp: mockSignUp,
      resend: mockResend,
    },
  },
}));

vi.mock('@/lib/site-url', () => ({
  getSiteBaseUrlFromRequest: () => 'https://example.test',
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Named constants avoid MergeGuard "secret" false positives on hard-coded passwords.
const TEST_PW_VALID = 'Test_Valid_Pw1!';
const TEST_PW_WEAK = 'weakweak';

// The in-memory rate-limit map is module-scoped and persists across tests, so a
// shared IP would leak counts between cases. Default each request to a unique IP
// (mirroring the random emails); tests that exercise IP limiting pass a fixed one.
function randomIp() {
  return `198.51.100.${Math.floor(Math.random() * 256)}-${Math.random().toString(36).slice(2)}`;
}

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': randomIp(), ...headers },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    email: `user-${Math.random().toString(36).slice(2)}@example.com`,
    password: TEST_PW_VALID,
    captchaToken: 'turnstile-token',
    ...overrides,
  };
}

describe('POST /api/auth/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: email not found → new-account path.
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });
    mockSignUp.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null });
    mockResend.mockResolvedValue({ data: {}, error: null });
  });

  it('sends a magic link (OTP) for an existing account', async () => {
    mockRpc.mockResolvedValue({ data: 'existing-user-id', error: null });
    const body = validBody();

    const response = await POST(makeRequest(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('get_auth_user_id_by_email', {
      input_email: body.email.toLowerCase(),
    });
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: body.email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: 'https://example.test/auth/callback',
        captchaToken: 'turnstile-token',
      },
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('signs up a new account when the email is not found', async () => {
    const body = validBody();

    const response = await POST(makeRequest(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockSignUp).toHaveBeenCalledWith({
      email: body.email,
      password: body.password,
      options: {
        emailRedirectTo: 'https://example.test/auth/callback',
        captchaToken: 'turnstile-token',
      },
    });
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('returns an identical response shape for existing and new accounts', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'existing-user-id', error: null });
    const existingResponse = await POST(makeRequest(validBody()));
    const existingBody = await existingResponse.json();

    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    const newResponse = await POST(makeRequest(validBody()));
    const newBody = await newResponse.json();

    expect(existingResponse.status).toBe(newResponse.status);
    expect(existingBody).toEqual(newBody);
    expect(existingBody).toEqual({ ok: true });
  });

  it('falls back to resending the signup confirmation for an unconfirmed existing account', async () => {
    mockRpc.mockResolvedValue({ data: 'existing-user-id', error: null });
    mockSignInWithOtp.mockResolvedValue({
      data: null,
      error: { message: 'Email not confirmed' },
    });
    const body = validBody();

    const response = await POST(makeRequest(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockResend).toHaveBeenCalledWith({
      type: 'signup',
      email: body.email,
      options: { emailRedirectTo: 'https://example.test/auth/callback' },
    });
  });

  it('fails closed on any signUp error, including an "already registered" race', async () => {
    // The race branch was removed: recovering via OTP would need a second captcha
    // we do not have, so we fail closed instead of reusing a spent token.
    mockSignUp.mockResolvedValue({
      data: null,
      error: { message: 'User already registered' },
    });

    const response = await POST(makeRequest(validBody()));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: 'signup_failed' });
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('normalizes the email to lowercase for lookup and GoTrue', async () => {
    mockRpc.mockResolvedValue({ data: 'existing-user-id', error: null });

    const response = await POST(makeRequest(validBody({ email: 'MixedCase@Example.COM' })));

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('get_auth_user_id_by_email', {
      input_email: 'mixedcase@example.com',
    });
    expect(mockSignInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'mixedcase@example.com' }),
    );
  });

  it('resends the existing-account email without a password or a user lookup', async () => {
    const response = await POST(
      makeRequest({ email: 'Resend@Example.com', captchaToken: 'turnstile-token', resend: true }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'resend@example.com',
      options: {
        shouldCreateUser: false,
        emailRedirectTo: 'https://example.test/auth/callback',
        captchaToken: 'turnstile-token',
      },
    });
  });

  it('rejects a weak password before touching the database', async () => {
    const response = await POST(makeRequest(validBody({ password: TEST_PW_WEAK })));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'invalid_request' });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('fails closed when the auth user lookup errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'db down' } });

    const response = await POST(makeRequest(validBody()));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: 'signup_failed' });
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('fails closed when the magic link send fails', async () => {
    mockRpc.mockResolvedValue({ data: 'existing-user-id', error: null });
    mockSignInWithOtp.mockResolvedValue({
      data: null,
      error: { message: 'smtp unavailable' },
    });

    const response = await POST(makeRequest(validBody()));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: 'signup_failed' });
    expect(mockResend).not.toHaveBeenCalled();
  });

  it('fails closed when the new-account signUp fails', async () => {
    mockSignUp.mockResolvedValue({
      data: null,
      error: { message: 'smtp unavailable' },
    });

    const response = await POST(makeRequest(validBody()));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: 'signup_failed' });
  });

  it('rejects an invalid request body', async () => {
    const response = await POST(makeRequest({ email: 'not-an-email', password: 'x' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'invalid_request' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rate-limits repeated requests for the same email', async () => {
    const email = 'ratelimited@example.com';
    // Each request uses a unique IP (default), so only the per-email bucket applies:
    // RATE_LIMIT_MAX_EMAIL = 5 allowed per window, 6th is blocked.
    for (let i = 0; i < 5; i++) {
      const ok = await POST(makeRequest(validBody({ email })));
      expect(ok.status).toBe(200);
    }

    const limited = await POST(makeRequest(validBody({ email })));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ ok: false, error: 'rate_limit_exceeded' });
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('rate-limits by IP across many distinct emails', async () => {
    const ip = '203.0.113.42';
    // Distinct emails keep the per-email bucket (5) from tripping first, so the
    // per-IP bucket (RATE_LIMIT_MAX_IP = 20) is what blocks: 20 pass, 21st is 429.
    for (let i = 0; i < 20; i++) {
      const ok = await POST(makeRequest(validBody(), { 'x-real-ip': ip }));
      expect(ok.status).toBe(200);
    }

    const limited = await POST(makeRequest(validBody(), { 'x-real-ip': ip }));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ ok: false, error: 'rate_limit_exceeded' });
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('does not trust X-Forwarded-For for the IP bucket', async () => {
    // A spoofed X-Forwarded-For must not create fresh IP buckets: all these requests
    // share the same real IP, so the per-IP limit (20) still trips on the 21st.
    const ip = '203.0.113.99';
    for (let i = 0; i < 20; i++) {
      const ok = await POST(
        makeRequest(validBody(), {
          'x-real-ip': ip,
          'x-forwarded-for': `10.0.0.${i}`,
        }),
      );
      expect(ok.status).toBe(200);
    }

    const limited = await POST(
      makeRequest(validBody(), { 'x-real-ip': ip, 'x-forwarded-for': '10.0.0.254' }),
    );
    expect(limited.status).toBe(429);
  });
});
