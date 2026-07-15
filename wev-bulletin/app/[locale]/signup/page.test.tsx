import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, fireEvent, render, screen, waitFor } from '@/test-utils';
import SignupPage from './page';
import { createClient } from '@/lib/supabase/client';
import { PASSWORD_FIELD_PLACEHOLDER } from '@/lib/auth';

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/i18n/navigation', () => import('@/test-utils/i18n-navigation-mock'));

vi.mock('@/components/TurnstileWidget', () => import('@/test-utils/turnstile-widget-mock'));

vi.mock('@/hooks/usePasswordStrength', () => ({
  usePasswordStrength: () => ({
    score: 3,
    label: 'Good',
    color: 'var(--success-solid)',
    isAcceptable: true,
    feedback: '',
  }),
}));

// Named constant avoids MergeGuard "secret" false positives on hard-coded passwords.
const TEST_PW_VALID = 'Test_Valid_Pw1!';

const fetchMock = vi.fn();

async function fillAndSubmit() {
  const user = userEvent.setup();
  render(<SignupPage />);

  await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
  await user.type(screen.getByPlaceholderText(PASSWORD_FIELD_PLACEHOLDER), TEST_PW_VALID);
  await user.click(screen.getByRole('button', { name: /complete captcha/i }));
  await user.click(screen.getByRole('button', { name: /create account/i }));
}

describe('SignupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Only the resend action still touches the browser Supabase client.
    vi.mocked(createClient).mockReturnValue({
      auth: { resend: vi.fn() },
    } as never);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to /api/auth/signup and shows the check-email state on success', async () => {
    await fillAndSubmit();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/signup',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'test@example.com',
            password: TEST_PW_VALID,
            captchaToken: 'turnstile-token',
          }),
        }),
      );
    });

    expect(screen.getByRole('heading', { name: /check your email to continue/i })).toBeVisible();
    expect(
      screen.queryByText(/if an account exists for this email, we['’]ll send you a link/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again in 30s/i })).toBeVisible();
    expect(screen.getByRole('link', { name: /log in/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /create account/i })).not.toBeInTheDocument();
  });

  it('does not call supabase.auth.signUp from the browser', async () => {
    const signUpSpy = vi.fn();
    vi.mocked(createClient).mockReturnValue({
      auth: { signUp: signUpSpy, resend: vi.fn() },
    } as never);

    await fillAndSubmit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(signUpSpy).not.toHaveBeenCalled();
  });

  it('shows an error and stays on the form when the request fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, error: 'signup_failed' }),
    });

    await fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeVisible();
    });
    expect(screen.queryByRole('heading', { name: /check your email/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('surfaces a distinct message when the server rate-limits (429)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ ok: false, error: 'rate_limit_exceeded' }),
    });

    await fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByText(/too many attempts/i)).toBeVisible();
    });
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('resends through the server with the resend flag and a fresh captcha token', async () => {
    vi.useFakeTimers();
    try {
      render(<SignupPage />);

      fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
        target: { value: 'test@example.com' },
      });
      fireEvent.change(screen.getByPlaceholderText(PASSWORD_FIELD_PLACEHOLDER), {
        target: { value: TEST_PW_VALID },
      });
      fireEvent.click(screen.getByRole('button', { name: /complete captcha/i }));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /create account/i }));
      });

      expect(screen.getByRole('heading', { name: /check your email/i })).toBeVisible();

      // Re-arm the (visually hidden, aria-hidden) Turnstile so resend has a fresh
      // token, then wait out the 30s resend cooldown enforced by CheckEmailCard.
      // The cooldown re-schedules a 1s timer each tick, so advance one tick at a
      // time to let React re-render and re-arm the next timer between advances.
      fireEvent.click(screen.getByText('Complete CAPTCHA'));
      for (let i = 0; i < 30; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1_000);
        });
      }

      fetchMock.mockClear();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /send another link/i }));
      });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/signup',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'test@example.com',
            captchaToken: 'turnstile-token',
            resend: true,
          }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
