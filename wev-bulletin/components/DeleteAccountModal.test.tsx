import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import DeleteAccountModal from './DeleteAccountModal';

vi.mock('@/components/TurnstileWidget', () => import('@/test-utils/turnstile-widget-mock'));

// Mock the router
vi.mock('@/i18n/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signOut: vi.fn(),
    },
  })),
}));

// Mock toast
vi.mock('@/lib/toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.location
Object.defineProperty(window, 'location', {
  value: { href: '' },
  writable: true,
});

describe('DeleteAccountModal', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
    window.location.href = '';
  });

  it('does not render when closed', () => {
    render(<DeleteAccountModal isOpen={false} onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders modal content when open', () => {
    render(<DeleteAccountModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /delete account/i })).toBeVisible();
    expect(screen.getByText(/this action will permanently delete/i)).toBeVisible();
    expect(screen.getByText(/your profile and personal information/i)).toBeVisible();
    expect(screen.getByText(/all your bookmarked jobs/i)).toBeVisible();
    expect(screen.getByText(/your job match history/i)).toBeVisible();
    expect(screen.getByText(/this action cannot be undone/i)).toBeVisible();
  });

  it('has form fields and buttons', () => {
    render(<DeleteAccountModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText(/enter your password/i)).toBeVisible();
    expect(screen.getByText(/type delete to confirm/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /delete account/i })).toBeVisible();
  });

  it('calls onClose when cancel button is clicked', async () => {
    const mockOnClose = vi.fn();
    render(<DeleteAccountModal isOpen={true} onClose={mockOnClose} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockOnClose).toHaveBeenCalledOnce();
  });

  it('shows error when password is missing', async () => {
    render(<DeleteAccountModal isOpen={true} onClose={vi.fn()} />);

    const confirmInput = screen.getByPlaceholderText(/delete/i);
    const deleteButton = screen.getByRole('button', { name: /delete account/i });

    // Fill only confirmation
    await user.type(confirmInput, 'DELETE');
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(/password is required to delete your account/i)).toBeVisible();
    });
  });

  it('shows error when confirmation is wrong', async () => {
    render(<DeleteAccountModal isOpen={true} onClose={vi.fn()} />);

    const passwordInput = screen.getByPlaceholderText(/current password/i);
    const confirmInput = screen.getByPlaceholderText(/delete/i);
    const deleteButton = screen.getByRole('button', { name: /delete account/i });

    await user.type(passwordInput, 'mypassword123');
    await user.type(confirmInput, 'WRONG');
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(/please type delete to confirm/i)).toBeVisible();
    });
  });

  it('successfully deletes account', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Account successfully deleted' }),
    });

    render(<DeleteAccountModal isOpen={true} onClose={vi.fn()} />);

    const passwordInput = screen.getByPlaceholderText(/current password/i);
    const confirmInput = screen.getByPlaceholderText(/delete/i);
    const deleteButton = screen.getByRole('button', { name: /delete account/i });

    await user.type(passwordInput, 'mypassword123');
    await user.type(confirmInput, 'DELETE');
    await user.click(deleteButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/account/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: 'mypassword123' }),
      });
    });

    await waitFor(() => {
      expect(window.location.href).toBe('/');
    });
  });

  it('handles API error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid password' }),
    });

    render(<DeleteAccountModal isOpen={true} onClose={vi.fn()} />);

    const passwordInput = screen.getByPlaceholderText(/current password/i);
    const confirmInput = screen.getByPlaceholderText(/delete/i);
    const deleteButton = screen.getByRole('button', { name: /delete account/i });

    await user.type(passwordInput, 'wrongpassword');
    await user.type(confirmInput, 'DELETE');
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(/invalid password/i)).toBeVisible();
    });

    consoleErrorSpy.mockRestore();
  });

  it('shows loading state during deletion', async () => {
    // Mock a delayed response
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({ message: 'Account successfully deleted' }),
              }),
            100,
          ),
        ),
    );

    render(<DeleteAccountModal isOpen={true} onClose={vi.fn()} />);

    const passwordInput = screen.getByPlaceholderText(/current password/i);
    const confirmInput = screen.getByPlaceholderText(/delete/i);
    const deleteButton = screen.getByRole('button', { name: /delete account/i });

    await user.type(passwordInput, 'mypassword123');
    await user.type(confirmInput, 'DELETE');
    // Capture the click promise so we can check loading state while it's pending,
    // then await it to avoid dangling unsettled promises.
    const clickPromise = user.click(deleteButton);
    
    // Should show loading state immediately while fetch is pending
    const loadingButton = await screen.findByRole('button', { name: /deleting/i });
    expect(loadingButton).toBeVisible();
    expect(loadingButton).toBeDisabled();

    // Await the click action to complete properly
    await clickPromise;

    // Wait for final state (redirect)
    await waitFor(
      () => {
        expect(window.location.href).toBe('/');
      },
      { timeout: 200 },
    );
  });

  it('accepts SUPPRIMER for French locale', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Account successfully deleted' }),
    });

    render(<DeleteAccountModal isOpen={true} onClose={vi.fn()} />);

    const passwordInput = screen.getByPlaceholderText(/current password/i);
    const confirmInput = screen.getByPlaceholderText(/delete/i);
    const deleteButton = screen.getByRole('button', { name: /delete account/i });

    await user.type(passwordInput, 'mypassword123');
    await user.type(confirmInput, 'SUPPRIMER');
    await user.click(deleteButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
