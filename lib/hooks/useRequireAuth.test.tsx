import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRequireAuth } from './useRequireAuth';

const { mockReplace } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: vi.fn(() => ({
    replace: mockReplace,
  })),
}));

import { useAuth } from '@/contexts/AuthContext';

describe('useRequireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not redirect while auth is loading', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: true,
    } as never);

    renderHook(() => useRequireAuth());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects to /login when there is no user after loading finishes', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
    } as never);

    renderHook(() => useRequireAuth());

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });

  it('does not redirect when a user is present', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1', email: 'a@b.com' } as never,
      loading: false,
    });

    renderHook(() => useRequireAuth());

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
