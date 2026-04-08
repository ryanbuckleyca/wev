import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { useAuth } from '@/contexts/AuthContext';
import { useRequireAuth } from './useRequireAuth';
import { createMockAuthContext } from '@/test-utils/auth-context-mock';
import { mockRouterReplace } from '@/test-utils/i18n-navigation-mock';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/i18n/navigation', () => import('@/test-utils/i18n-navigation-mock'));

describe('useRequireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not redirect while auth is loading', () => {
    vi.mocked(useAuth).mockReturnValue(createMockAuthContext({ user: null, loading: true }));

    renderHook(() => useRequireAuth());

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('redirects to /login once when there is no user after loading finishes', async () => {
    vi.mocked(useAuth).mockReturnValue(createMockAuthContext({ user: null, loading: false }));

    renderHook(() => useRequireAuth());

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/login');
    });
    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
  });

  it('does not redirect when a user is present', () => {
    vi.mocked(useAuth).mockReturnValue(
      createMockAuthContext({
        user: { id: 'u1', email: 'a@b.com' } as User,
        loading: false,
      }),
    );

    renderHook(() => useRequireAuth());

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('does not redirect when loading transitions to authenticated user', async () => {
    const authState = { user: null as User | null, loading: true };
    vi.mocked(useAuth).mockImplementation(() =>
      createMockAuthContext({ user: authState.user, loading: authState.loading }),
    );

    const { rerender } = renderHook(() => useRequireAuth());
    expect(mockRouterReplace).not.toHaveBeenCalled();

    await act(async () => {
      authState.loading = false;
      authState.user = { id: 'u1', email: 'a@b.com' } as User;
      rerender();
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
