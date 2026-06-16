import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

interface ProfileSyncOptions<T> {
  profileValue: T | null;
  selectedValue: T;
  setter: (value: T) => void;
  shouldSync: (profileValue: T | null, selectedValue: T, hasQueryParam: boolean) => boolean;
  /** When set, overrides the default `searchParams.has(queryParamName)` URL check. */
  hasExplicitUrlState?: () => boolean;
}

function isEmptyValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return value == null;
}

function valuesEqual<T>(left: T, right: T): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    const rightSet = new Set(right);
    return left.every((item) => rightSet.has(item));
  }
  return left === right;
}

/**
 * Synchronizes profile values with bulletin filter state.
 *
 * - On first load: applies profile defaults when `shouldSync` returns true.
 * - On profile update: re-applies when the user is still on the last synced profile
 *   defaults (selection matches what we previously synced from profile).
 * - Never overwrites explicit URL params or manual filter overrides.
 */
export function useProfileSync<T>(
  userId: string | null,
  profileLoading: boolean,
  queryParamName: string,
  options: ProfileSyncOptions<T>,
): void {
  const lastSyncedRef = useRef<{ userId: string | null; profileValue: T | null }>({
    userId: null,
    profileValue: null,
  });
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!userId) {
      lastSyncedRef.current = { userId: null, profileValue: null };
      return;
    }

    if (profileLoading) {
      return;
    }

    const hasQueryParam =
      options.hasExplicitUrlState?.() ?? (searchParams?.has(queryParamName) ?? false);

    const { profileValue, selectedValue, setter, shouldSync } = options;
    const lastSynced = lastSyncedRef.current;

    const matchesLastSynced =
      lastSynced.userId === userId &&
      lastSynced.profileValue !== null &&
      valuesEqual(selectedValue, lastSynced.profileValue);

    const profileChanged =
      lastSynced.userId !== userId || !valuesEqual(lastSynced.profileValue, profileValue);

    const shouldInitialSync = shouldSync(profileValue, selectedValue, hasQueryParam);

    const emptySelected = (Array.isArray(selectedValue) ? [] : selectedValue) as T;
    const profileIsApplicable = shouldSync(profileValue, emptySelected, false);

    const shouldUpdateFromProfile =
      profileChanged &&
      !hasQueryParam &&
      profileValue !== null &&
      profileIsApplicable &&
      !valuesEqual(selectedValue, profileValue) &&
      (isEmptyValue(selectedValue) || matchesLastSynced);

    if ((shouldInitialSync || shouldUpdateFromProfile) && profileValue !== null) {
      setter(profileValue);
      lastSyncedRef.current = { userId, profileValue };
      return;
    }

    if (lastSynced.userId !== userId) {
      lastSyncedRef.current = { userId, profileValue: null };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    userId,
    profileLoading,
    queryParamName,
    searchParams,
    options.profileValue,
    options.selectedValue,
    // options.shouldSync, options.setter, options.hasExplicitUrlState are stable
  ]);
}
