import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthStatus from './AuthStatus';
import { createClient } from '@/lib/supabase/client';

// Mock next-intl hooks (keep other exports real to avoid cross-test interference)
vi.mock('next-intl', async () => {
  const actual = await vi.importActual<typeof import('next-intl')>('next-intl');
  return {
    ...actual,
    useTranslations: () => (key: string) => key,
    useLocale: () => 'en',
  };
});

// Mock supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

// Mock site-url
vi.mock('@/lib/site-url', () => ({
  getSiteBaseUrl: vi.fn(() => 'http://localhost:3000'),
}));

// Mock LinkButton
vi.mock('@/components/LinkButton', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('AuthStatus', () => {
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue(mockSupabase as any);
  });

  it('renders login link when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    render(<AuthStatus />);

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /log in/i });
      expect(link).toBeVisible();
      expect(link).toHaveAttribute('href', '/login');
    });
  });

  it('renders user email and logout button when authenticated', async () => {
    const mockUser = { email: 'test@example.com' };
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser } });

    render(<AuthStatus />);

    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeVisible();
      expect(screen.getByRole('button', { name: /log out/i })).toBeVisible();
    });
  });

  it('calls signOut and redirects on logout', async () => {
    const user = userEvent.setup();
    const mockUser = { email: 'test@example.com' };
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser } });
    mockSupabase.auth.signOut.mockResolvedValue({ error: null });

    // Mock window.location
    const originalLocation = window.location;
    const locationMock = { href: '' };
    Object.defineProperty(window, 'location', {
      value: locationMock,
      writable: true,
      configurable: true,
    });

    render(<AuthStatus />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /log out/i })).toBeVisible();
    });

    await user.click(screen.getByRole('button', { name: /log out/i }));

    expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    expect(window.location.href).toBe('http://localhost:3000/en');

    // Restore original location
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });
});
