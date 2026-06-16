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
      }),
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
      }),
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
      }),
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
      }),
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
      }),
    );

    expect(shouldSync).toHaveBeenCalled();
    expect(setter).not.toHaveBeenCalled();
  });

  it('does not re-sync when selection no longer matches profile defaults', () => {
    const setter = vi.fn();
    const shouldSync = vi.fn(
      (_profileValue: string[] | null, selectedValue: string[]) =>
        !!_profileValue && _profileValue.length > 0 && selectedValue.length === 0,
    );

    const { rerender } = renderHook(
      ({ profileValue, selectedValue }) =>
        useProfileSync('user-123', false, 'workType', {
          profileValue,
          selectedValue,
          setter,
          shouldSync,
        }),
      {
        initialProps: {
          profileValue: ['remote'] as string[] | null,
          selectedValue: [] as string[],
        },
      },
    );

    expect(setter).toHaveBeenCalledWith(['remote']);

    rerender({ profileValue: ['hybrid', 'office'], selectedValue: ['office'] });

    expect(setter).toHaveBeenCalledTimes(1);
  });

  it('re-syncs when profile changes and selection still matches last synced profile value', () => {
    const setter = vi.fn();
    const shouldSync = vi.fn(
      (profileValue: string[] | null, selectedValue: string[], hasQueryParam: boolean) => {
        if (!profileValue || profileValue.length === 0) return false;
        if (hasQueryParam || selectedValue.length > 0) return false;
        return true;
      },
    );

    const { rerender } = renderHook(
      ({ profileValue, selectedValue }) =>
        useProfileSync('user-123', false, 'workType', {
          profileValue,
          selectedValue,
          setter,
          shouldSync,
        }),
      {
        initialProps: {
          profileValue: ['remote'] as string[] | null,
          selectedValue: [] as string[],
        },
      },
    );

    expect(setter).toHaveBeenCalledWith(['remote']);

    rerender({ profileValue: ['hybrid', 'office'], selectedValue: ['remote'] });

    expect(setter).toHaveBeenCalledTimes(2);
    expect(setter).toHaveBeenLastCalledWith(['hybrid', 'office']);
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
      { initialProps: { userId: 'user-123' } },
    );

    expect(setter).toHaveBeenCalledTimes(1);

    rerender({ userId: 'user-456' });

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
      { initialProps: { userId: 'user-123' as string | null } },
    );

    expect(setter).toHaveBeenCalledTimes(1);

    rerender({ userId: null });
    rerender({ userId: 'user-123' });

    expect(setter).toHaveBeenCalledTimes(2);
  });
});
