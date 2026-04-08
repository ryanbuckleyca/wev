import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuth } from '@/contexts/AuthContext';
import { useRequireAuth } from './useRequireAuth';
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
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: true,
    } as never);

    renderHook(() => useRequireAuth());

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('redirects to /login once when there is no user after loading finishes', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
    } as never);

    renderHook(() => useRequireAuth());

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/login');
    });
    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
  });

  it('does not redirect when a user is present', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1', email: 'a@b.com' } as never,
      loading: false,
    } as never);

    renderHook(() => useRequireAuth());

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('does not redirect when loading transitions to authenticated user', async () => {
    const authState = {
      user: null as { id: string; email: string } | null,
      loading: true,
    };
    vi.mocked(useAuth).mockImplementation(
      () =>
        ({
          user: authState.user,
          loading: authState.loading,
        }) as never,
    );

    const { rerender } = renderHook(() => useRequireAuth());
    expect(mockRouterReplace).not.toHaveBeenCalled();

    authState.loading = false;
    authState.user = { id: 'u1', email: 'a@b.com' };
    rerender();

    await waitFor(() => {
      expect(mockRouterReplace).not.toHaveBeenCalled();
    });
  });
});
