import { renderHook, act } from '@testing-library/react';
import { useBulletinFilters } from './useBulletinFilters';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useSearchParams } from 'next/navigation';
import { useQueryState } from 'nuqs';
import { useState } from 'react';
import { useProfileSync } from './useProfileSync';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/contexts/ProfileContext', () => ({
  useProfile: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
}));

vi.mock('nuqs', () => ({
  useQueryState: vi.fn((key, options) => {
    const [val, setVal] = useState(options.defaultValue);
    return [val, setVal];
  }),
  parseAsString: { withDefault: (v: string) => ({ defaultValue: v }) },
  parseAsArrayOf: () => ({ withDefault: (v: any) => ({ defaultValue: v }) }),
  parseAsBoolean: { withDefault: (v: boolean) => ({ defaultValue: v }) },
  parseAsInteger: { withDefault: (v: number) => ({ defaultValue: v }) },
  parseAsStringLiteral: () => ({ withDefault: (v: string) => ({ defaultValue: v }) }),
}));

vi.mock('./useProfileSync', () => ({
  useProfileSync: vi.fn(),
}));

describe('useBulletinFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false } as any);
    vi.mocked(useProfile).mockReturnValue({ profile: null, loading: false } as any);
    vi.mocked(useSearchParams).mockReturnValue({ has: () => false, getAll: () => [] } as any);
  });

  it('initializes with default values', () => {
    const { result } = renderHook(() => useBulletinFilters());
    expect(result.current.searchQuery).toBe('');
    expect(result.current.showOnlySse).toBe(true);
    expect(result.current.postedWithin).toBe('2-weeks');
    expect(result.current.selectedOrganizations).toEqual([]);
  });

  it('identifies if any filters are active', () => {
    const { result } = renderHook(() => useBulletinFilters());
    // Default showOnlySse is true, which counts as a filter
    expect(result.current.hasAnyFilters).toBe(true);
  });

  it('clears all filters', async () => {
    const { result } = renderHook(() => useBulletinFilters());

    await act(async () => {
      result.current.clearAllFilters();
    });

    expect(result.current.searchQuery).toBe('');
    expect(result.current.showOnlySse).toBe(false);
    expect(result.current.postedWithin).toBe('any');
  });

  it('applies suggested defaults', async () => {
    const { result } = renderHook(() => useBulletinFilters());

    await act(async () => {
      result.current.applySuggestedDefaults();
    });

    expect(result.current.showOnlySse).toBe(true);
    expect(result.current.postedWithin).toBe('2-weeks');
  });

  it('detects if using profile location', () => {
    const profile = { municipality: 'Montreal', province: 'QC' };
    vi.mocked(useProfile).mockReturnValue({ profile, loading: false } as any);
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' }, loading: false } as any);

    const { result } = renderHook(() => useBulletinFilters());

    act(() => {
      result.current.setSelectedMunicipalities(['Montreal']);
      result.current.setSelectedProvinces(['QC']);
    });

    expect(result.current.isUsingProfileLocation).toBe(true);
  });

  it('resets to profile work types', async () => {
    const profile = { work_types: ['remote'] };
    vi.mocked(useProfile).mockReturnValue({ profile, loading: false } as any);
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' }, loading: false } as any);

    const { result } = renderHook(() => useBulletinFilters());

    await act(async () => {
      result.current.handleResetToProfileWorkTypes();
    });

    expect(result.current.selectedWorkTypes).toEqual(['remote']);
  });

  it('toggles filters expanded state', () => {
    const { result } = renderHook(() => useBulletinFilters());
    expect(result.current.filtersExpanded).toBe(false);

    act(() => {
      result.current.setFiltersExpanded(true);
    });
    expect(result.current.filtersExpanded).toBe(true);
  });

  describe('language profile preference', () => {
    it('isUsingProfileLanguages is false when no profile languages set', () => {
      vi.mocked(useProfile).mockReturnValue({ profile: { preferred_languages: [] }, loading: false } as any);
      vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' }, loading: false } as any);

      const { result } = renderHook(() => useBulletinFilters());

      expect(result.current.isUsingProfileLanguages).toBe(false);
    });

    it('isUsingProfileLanguages is true when selected languages match profile', () => {
      vi.mocked(useProfile).mockReturnValue({
        profile: { preferred_languages: ['en', 'fr'] },
        loading: false,
      } as any);
      vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' }, loading: false } as any);

      const { result } = renderHook(() => useBulletinFilters());

      act(() => {
        result.current.setSelectedLanguages(['fr', 'en']);
      });

      expect(result.current.isUsingProfileLanguages).toBe(true);
    });

    it('isUsingProfileLanguages is false when selected languages differ from profile', () => {
      vi.mocked(useProfile).mockReturnValue({
        profile: { preferred_languages: ['en'] },
        loading: false,
      } as any);
      vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' }, loading: false } as any);

      const { result } = renderHook(() => useBulletinFilters());

      act(() => {
        result.current.setSelectedLanguages(['fr']);
      });

      expect(result.current.isUsingProfileLanguages).toBe(false);
    });

    it('handleResetToProfileLanguages restores profile languages', async () => {
      vi.mocked(useProfile).mockReturnValue({
        profile: { preferred_languages: ['fr'] },
        loading: false,
      } as any);
      vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' }, loading: false } as any);

      const { result } = renderHook(() => useBulletinFilters());

      await act(async () => {
        result.current.setSelectedLanguages(['en']);
      });
      expect(result.current.selectedLanguages).toEqual(['en']);

      await act(async () => {
        result.current.handleResetToProfileLanguages();
      });

      expect(result.current.selectedLanguages).toEqual(['fr']);
    });

    it('handleResetToProfileLanguages is a no-op when profile has no languages', async () => {
      vi.mocked(useProfile).mockReturnValue({
        profile: { preferred_languages: [] },
        loading: false,
      } as any);
      vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' }, loading: false } as any);

      const { result } = renderHook(() => useBulletinFilters());

      await act(async () => {
        result.current.setSelectedLanguages(['en']);
        result.current.handleResetToProfileLanguages();
      });

      expect(result.current.selectedLanguages).toEqual(['en']);
    });

    it('calls useProfileSync with lang query param key for language sync', () => {
      vi.mocked(useProfile).mockReturnValue({
        profile: { preferred_languages: ['en'] },
        loading: false,
      } as any);
      vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' }, loading: false } as any);

      renderHook(() => useBulletinFilters());

      const syncCalls = vi.mocked(useProfileSync).mock.calls;
      const langSyncCall = syncCalls.find((call) => call[2] === 'lang');
      expect(langSyncCall).toBeDefined();
    });

    it('useProfileSync shouldSync returns false when lang query param present', () => {
      vi.mocked(useProfile).mockReturnValue({
        profile: { preferred_languages: ['en'] },
        loading: false,
      } as any);
      vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' }, loading: false } as any);

      renderHook(() => useBulletinFilters());

      const syncCalls = vi.mocked(useProfileSync).mock.calls;
      const langSyncCall = syncCalls.find((call) => call[2] === 'lang');
      const { shouldSync } = langSyncCall![3] as { shouldSync: (p: string[], s: string[], q: boolean) => boolean };

      expect(shouldSync(['en'], [], true)).toBe(false);  // query param present
      expect(shouldSync(['en'], ['fr'], false)).toBe(false); // already has selection
      expect(shouldSync([], [], false)).toBe(false);  // no profile value
      expect(shouldSync(['en'], [], false)).toBe(true);  // should sync
    });
  });
});
