import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen, waitFor } from '@/test-utils';
import ResetPasswordPage from './page';
import { createClient } from '@/lib/supabase/client';
import { usePasswordStrength } from '@/hooks/usePasswordStrength';
import { RESET_PASSWORD_FIELD_PLACEHOLDER } from '@/lib/auth/auth-form-placeholders';
import { mockRouterPush } from '@/test-utils/i18n-navigation-mock';

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/hooks/usePasswordStrength', () => ({
  usePasswordStrength: vi.fn(),
}));

vi.mock('@/i18n/navigation', () => import('@/test-utils/i18n-navigation-mock'));

vi.mock('@/components/PasswordStrengthIndicator', () => ({
  default: () => null,
}));

const mockGetSession = vi.fn();
const mockUpdateUser = vi.fn();

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
  });

  it('shows invalid link state when there is no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(screen.getByText(/invalid or expired reset link/i)).toBeVisible();
    });
    const requestLink = screen.getByRole('link', { name: /request a new reset link/i });
    expect(requestLink).toBeVisible();
    // Unit test uses a plain `<a>` mock for `next-intl` Link; the real app may prefix locale.
    expect(requestLink).toHaveAttribute('href', '/forgot-password');
  });

  it('updates password and redirects on success', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText(RESET_PASSWORD_FIELD_PLACEHOLDER)).toHaveLength(2);
    });

    const fields = screen.getAllByPlaceholderText(RESET_PASSWORD_FIELD_PLACEHOLDER);
    await user.type(fields[0], 'StrongPass123!');
    await user.type(fields[1], 'StrongPass123!');
    await user.click(screen.getByRole('button', { name: /^update password$/i }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'StrongPass123!' });
      expect(mockRouterPush).toHaveBeenCalledWith('/');
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

    const { container } = render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText(RESET_PASSWORD_FIELD_PLACEHOLDER)).toHaveLength(2);
    });

    const fields = screen.getAllByPlaceholderText(RESET_PASSWORD_FIELD_PLACEHOLDER);
    await user.type(fields[0], 'weak');
    await user.type(fields[1], 'weak');
    // Submit is disabled when strength is unacceptable, so Enter does not fire `onSubmit` in jsdom.
    const form = container.querySelector('form');
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
      expect(screen.getAllByPlaceholderText(RESET_PASSWORD_FIELD_PLACEHOLDER)).toHaveLength(2);
    });

    const fields = screen.getAllByPlaceholderText(RESET_PASSWORD_FIELD_PLACEHOLDER);
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
      expect(screen.getAllByPlaceholderText(RESET_PASSWORD_FIELD_PLACEHOLDER)).toHaveLength(2);
    });

    const fields = screen.getAllByPlaceholderText(RESET_PASSWORD_FIELD_PLACEHOLDER);
    await user.type(fields[0], 'StrongPass123!');
    await user.type(fields[1], 'StrongPass123!');
    await user.click(screen.getByRole('button', { name: /^update password$/i }));

    await waitFor(() => {
      expect(screen.getByText('Could not update user')).toBeVisible();
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});
