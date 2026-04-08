import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@/test-utils';
import ResetPasswordPage from './page';
import { createClient } from '@/lib/supabase/client';
import { usePasswordStrength } from '@/hooks/usePasswordStrength';

const { mockPush } = vi.hoisted(() => ({
  mockPush: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/hooks/usePasswordStrength', () => ({
  usePasswordStrength: vi.fn(),
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
    push: mockPush,
  })),
}));

vi.mock('@/components/PasswordStrengthIndicator', () => ({
  default: () => null,
}));

const mockGetSession = vi.fn();
const mockUpdateUser = vi.fn();

import { useRouter } from '@/i18n/navigation';

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    mockUpdateUser.mockResolvedValue({ error: null });
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getSession: mockGetSession,
        updateUser: mockUpdateUser,
      },
    } as never);
    vi.mocked(usePasswordStrength).mockReturnValue({
      score: 3,
      label: 'Good',
      color: 'var(--success-solid)',
      isAcceptable: true,
      feedback: '',
    });
    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
    } as never);
  });

  it('shows invalid link state when there is no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(screen.getByText(/invalid or expired reset link/i)).toBeVisible();
    });
    expect(screen.getByRole('link', { name: /request a new reset link/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('updates password and redirects on success', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('••••••••••')).toHaveLength(2);
    });

    const fields = screen.getAllByPlaceholderText('••••••••••');
    await user.type(fields[0], 'StrongPass123!');
    await user.type(fields[1], 'StrongPass123!');
    await user.click(screen.getByRole('button', { name: /^update password$/i }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'StrongPass123!' });
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('shows weak password error when strength is not acceptable', async () => {
    const user = userEvent.setup();
    vi.mocked(usePasswordStrength).mockReturnValue({
      score: 0,
      label: 'Weak',
      color: 'red',
      isAcceptable: false,
      feedback: 'too short',
    });

    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('••••••••••')).toHaveLength(2);
    });

    const fields = screen.getAllByPlaceholderText('••••••••••');
    await user.type(fields[0], 'weak');
    await user.type(fields[1], 'weak');
    const form = document.querySelector('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText(/password is too weak/i)).toBeVisible();
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('shows mismatch error when passwords differ', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('••••••••••')).toHaveLength(2);
    });

    const fields = screen.getAllByPlaceholderText('••••••••••');
    await user.type(fields[0], 'StrongPass123!');
    await user.type(fields[1], 'StrongPass124!');
    await user.click(screen.getByRole('button', { name: /^update password$/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeVisible();
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('shows update error when updateUser fails', async () => {
    const user = userEvent.setup();
    mockUpdateUser.mockResolvedValue({ error: { message: 'Could not update user' } });

    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('••••••••••')).toHaveLength(2);
    });

    const fields = screen.getAllByPlaceholderText('••••••••••');
    await user.type(fields[0], 'StrongPass123!');
    await user.type(fields[1], 'StrongPass123!');
    await user.click(screen.getByRole('button', { name: /^update password$/i }));

    await waitFor(() => {
      expect(screen.getByText('Could not update user')).toBeVisible();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
