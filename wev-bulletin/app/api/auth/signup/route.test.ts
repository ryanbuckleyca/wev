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

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    email: `user-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'StrongPass123!',
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

  it('treats an "already registered" race on signUp by sending a magic link', async () => {
    mockSignUp.mockResolvedValue({
      data: null,
      error: { message: 'User already registered' },
    });
    const body = validBody();

    const response = await POST(makeRequest(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: body.email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: 'https://example.test/auth/callback',
        captchaToken: 'turnstile-token',
      },
    });
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
    // RATE_LIMIT_MAX = 5 allowed per window, 6th is blocked.
    for (let i = 0; i < 5; i++) {
      const ok = await POST(makeRequest(validBody({ email })));
      expect(ok.status).toBe(200);
    }

    const limited = await POST(makeRequest(validBody({ email })));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ ok: false, error: 'rate_limit_exceeded' });
  });
});
