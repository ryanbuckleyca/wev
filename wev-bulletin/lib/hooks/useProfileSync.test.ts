import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProfileSync } from './useProfileSync';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => ({
    has: vi.fn(() => false),
  })),
}));

describe('useProfileSync', () => {
  it('does not sync when user is not logged in', () => {
    const setter = vi.fn();
    const shouldSync = vi.fn(() => true);

    renderHook(() =>
      useProfileSync(null, false, 'test', {
        profileValue: 'profile-value',
        selectedValue: 'selected-value',
        setter,
        shouldSync,
      })
    );

    expect(setter).not.toHaveBeenCalled();
    expect(shouldSync).not.toHaveBeenCalled();
  });

  it('does not sync when profile is loading', () => {
    const setter = vi.fn();
    const shouldSync = vi.fn(() => true);

    renderHook(() =>
      useProfileSync('user-123', true, 'test', {
        profileValue: 'profile-value',
        selectedValue: 'selected-value',
        setter,
        shouldSync,
      })
    );

    expect(setter).not.toHaveBeenCalled();
    expect(shouldSync).not.toHaveBeenCalled();
  });

  it('syncs profile value when shouldSync returns true', () => {
    const setter = vi.fn();
    const shouldSync = vi.fn(() => true);

    renderHook(() =>
      useProfileSync('user-123', false, 'test', {
        profileValue: 'profile-value',
        selectedValue: 'selected-value',
        setter,
        shouldSync,
      })
    );

    expect(shouldSync).toHaveBeenCalledWith('profile-value', 'selected-value', false);
    expect(setter).toHaveBeenCalledWith('profile-value');
  });

  it('does not sync when shouldSync returns false', () => {
    const setter = vi.fn();
    const shouldSync = vi.fn(() => false);

    renderHook(() =>
      useProfileSync('user-123', false, 'test', {
        profileValue: 'profile-value',
        selectedValue: 'selected-value',
        setter,
        shouldSync,
      })
    );

    expect(shouldSync).toHaveBeenCalled();
    expect(setter).not.toHaveBeenCalled();
  });

  it('does not sync when profile value is null', () => {
    const setter = vi.fn();
    const shouldSync = vi.fn(() => true);

    renderHook(() =>
      useProfileSync('user-123', false, 'test', {
        profileValue: null,
        selectedValue: 'selected-value',
        setter,
        shouldSync,
      })
    );

    expect(shouldSync).toHaveBeenCalled();
    expect(setter).not.toHaveBeenCalled();
  });

  it('only syncs once per user', () => {
    const setter = vi.fn();
    const shouldSync = vi.fn(() => true);

    const { rerender } = renderHook(
      ({ userId }) =>
        useProfileSync(userId, false, 'test', {
          profileValue: 'profile-value',
          selectedValue: 'selected-value',
          setter,
          shouldSync,
        }),
      { initialProps: { userId: 'user-123' } }
    );

    expect(setter).toHaveBeenCalledTimes(1);

    // Rerender with same user
    rerender({ userId: 'user-123' });

    // Should not sync again
    expect(setter).toHaveBeenCalledTimes(1);
  });

  it('syncs again when user changes', () => {
    const setter = vi.fn();
    const shouldSync = vi.fn(() => true);

    const { rerender } = renderHook(
      ({ userId }) =>
        useProfileSync(userId, false, 'test', {
          profileValue: 'profile-value',
          selectedValue: 'selected-value',
          setter,
          shouldSync,
        }),
      { initialProps: { userId: 'user-123' } }
    );

    expect(setter).toHaveBeenCalledTimes(1);

    // Change user
    rerender({ userId: 'user-456' });

    // Should sync again for new user
    expect(setter).toHaveBeenCalledTimes(2);
  });

  it('resets when user logs out', () => {
    const setter = vi.fn();
    const shouldSync = vi.fn(() => true);

    const { rerender } = renderHook(
      ({ userId }) =>
        useProfileSync(userId, false, 'test', {
          profileValue: 'profile-value',
          selectedValue: 'selected-value',
          setter,
          shouldSync,
        }),
      { initialProps: { userId: 'user-123' as string | null } }
    );

    expect(setter).toHaveBeenCalledTimes(1);

    // User logs out
    rerender({ userId: null });

    // User logs back in
    rerender({ userId: 'user-123' });

    // Should sync again after logout/login
    expect(setter).toHaveBeenCalledTimes(2);
  });
});
