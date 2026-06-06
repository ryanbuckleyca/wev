import { render, screen, fireEvent } from '@/test-utils';
import UserProfile from './UserProfile';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useAuth } from '@/contexts/AuthContext';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, prefetch, ...props }: any) => {
    void prefetch;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signOut: vi.fn(),
    },
  })),
}));

describe('UserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login/signup links when not logged in', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      role: null,
      loading: false,
      refresh: vi.fn(),
    } as any);

    render(<UserProfile />);
    expect(screen.getByText(/log in/i)).toBeInTheDocument();
    expect(screen.getByText(/sign up/i)).toBeInTheDocument();
  });

  it('renders user initials when logged in', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'test@example.com' },
      role: 'user',
      loading: false,
      refresh: vi.fn(),
    } as any);

    render(<UserProfile />);
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('opens dropdown menu on click when logged in', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'test@example.com' },
      role: 'user',
      loading: false,
      refresh: vi.fn(),
    } as any);

    render(<UserProfile />);
    const button = screen.getByLabelText(/open menu/i);
    fireEvent.click(button);

    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText(/my profile/i)).toBeInTheDocument();
    expect(screen.getByText(/log out/i)).toBeInTheDocument();
  });
});
