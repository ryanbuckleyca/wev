import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test-utils';
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

const fetchMock = vi.fn();

async function fillAndSubmit() {
  const user = userEvent.setup();
  render(<SignupPage />);

  await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
  await user.type(screen.getByPlaceholderText(PASSWORD_FIELD_PLACEHOLDER), 'StrongPass123!');
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
            password: 'StrongPass123!',
            captchaToken: 'turnstile-token',
          }),
        }),
      );
    });

    expect(screen.getByRole('heading', { name: /check your email/i })).toBeVisible();
    expect(
      screen.getByText(/if an account exists for this email, we['’]ll send you a link/i),
    ).toBeVisible();
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
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ ok: false, error: 'signup_failed' }) });

    await fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeVisible();
    });
    expect(screen.queryByRole('heading', { name: /check your email/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });
});
