import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@/test-utils';
import LoginPage from './page';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

const { mockReplace } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    prefetch,
    ...props
  }: {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
  }) => {
    void prefetch;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
  useRouter: vi.fn(() => ({
    replace: mockReplace,
  })),
}));

vi.mock('@/components/TurnstileWidget', () => ({
  default: ({ onSuccess }: { onSuccess: (token: string) => void }) => (
    <button type="button" onClick={() => onSuccess('turnstile-token')}>
      Complete CAPTCHA
    </button>
  ),
}));

const mockSignInWithPassword = vi.fn();

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithPassword.mockResolvedValue({ error: null });
    vi.mocked(createClient).mockReturnValue({
      auth: {
        signInWithPassword: mockSignInWithPassword,
      },
    } as never);
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
    } as never);
  });

  it('shows captcha required when the form is submitted without a completed captcha', async () => {
    const user = userEvent.setup();
    const { container } = render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('•••••••••'), 'secret123');
    // Submit is disabled without a captcha token, so Enter does not run `onSubmit` in jsdom.
    // Dispatching `submit` on the `<form>` exercises the handler (see TESTING.md §5 — prefer userEvent for real interactions).
    const form = container.querySelector('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText(/please complete the captcha verification/i)).toBeVisible();
    });
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('calls signInWithPassword and redirects after a successful login', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('•••••••••'), 'StrongPass123!');
    await user.click(screen.getByRole('button', { name: /complete captcha/i }));
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'StrongPass123!',
        options: { captchaToken: 'turnstile-token' },
      });
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });

  it('shows an error when signInWithPassword returns an error', async () => {
    const user = userEvent.setup();
    mockSignInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    });

    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('•••••••••'), 'wrong');
    await user.click(screen.getByRole('button', { name: /complete captcha/i }));
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid login credentials')).toBeVisible();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects away when the user is already authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'existing@example.com' } as never,
      loading: false,
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });
});
