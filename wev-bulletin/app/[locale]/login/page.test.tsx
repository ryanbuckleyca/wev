import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen, waitFor } from '@/test-utils';
import LoginPage from './page';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { useAuth } from '@/contexts/AuthContext';
import { PASSWORD_FIELD_PLACEHOLDER } from '@/lib/auth';
import { createMockAuthContext } from '@/test-utils/auth-context-mock';
import { mockRouterReplace } from '@/test-utils/i18n-navigation-mock';
import { mockTurnstileReset } from '@/test-utils/turnstile-widget-mock';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/i18n/navigation', () => import('@/test-utils/i18n-navigation-mock'));

vi.mock('@/components/TurnstileWidget', () => import('@/test-utils/turnstile-widget-mock'));

const mockSignInWithPassword = vi.fn();

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTurnstileReset.mockClear();
    mockSignInWithPassword.mockResolvedValue({ error: null });
    vi.mocked(createClient).mockReturnValue({
      auth: {
        signInWithPassword: mockSignInWithPassword,
      },
    } as never);
    vi.mocked(useAuth).mockReturnValue(createMockAuthContext({ user: null, loading: false }));
  });

  it('shows captcha required when the form is submitted without a completed captcha', async () => {
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
    await user.type(screen.getByPlaceholderText(PASSWORD_FIELD_PLACEHOLDER), 'secret123');
    // Submit is disabled without a captcha token, so Enter does not run `onSubmit` in jsdom.
    // Dispatching `submit` on the `<form>` exercises the handler (see TESTING.md — disabled submit exception).
    const form = container.querySelector('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText(/please complete the captcha verification/i)).toBeVisible();
    });
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('shows captcha error when Turnstile reports an error', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: /simulate captcha error/i }));

    await waitFor(() => {
      expect(screen.getByText(/captcha verification failed/i)).toBeVisible();
    });
  });

  it('clears captcha and requires verification again after Turnstile expires', async () => {
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com');
    await user.type(screen.getByPlaceholderText(PASSWORD_FIELD_PLACEHOLDER), 'secret123');
    await user.click(screen.getByRole('button', { name: /complete captcha/i }));
    await user.click(screen.getByRole('button', { name: /simulate captcha expire/i }));

    const form = container.querySelector('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText(/please complete the captcha verification/i)).toBeVisible();
    });
  });

  it('calls signInWithPassword and redirects after a successful login', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
    await user.type(screen.getByPlaceholderText(PASSWORD_FIELD_PLACEHOLDER), 'StrongPass123!');
    await user.click(screen.getByRole('button', { name: /complete captcha/i }));
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'StrongPass123!',
        options: { captchaToken: 'turnstile-token' },
      });
      expect(mockRouterReplace).toHaveBeenCalledWith('/');
    });
    expect(mockTurnstileReset).not.toHaveBeenCalled();
  });

  it('shows an error when signInWithPassword returns an error', async () => {
    const user = userEvent.setup();
    mockSignInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    });

    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
    await user.type(screen.getByPlaceholderText(PASSWORD_FIELD_PLACEHOLDER), 'wrong');
    await user.click(screen.getByRole('button', { name: /complete captcha/i }));
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid login credentials')).toBeVisible();
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();
    // Turnstile tokens are single-use after Supabase validates them; must reset the widget
    // or the next attempt reuses the token and Cloudflare returns timeout-or-duplicate.
    expect(mockTurnstileReset).toHaveBeenCalledTimes(1);
  });

  it('redirects away when the user is already authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue(
      createMockAuthContext({
        user: { id: 'user-1', email: 'existing@example.com' } as User,
        loading: false,
      }),
    );

    render(<LoginPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/');
    });
  });
});
