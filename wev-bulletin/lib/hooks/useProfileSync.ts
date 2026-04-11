import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

interface ProfileSyncOptions<T> {
  profileValue: T | null;
  selectedValue: T;
  setter: (value: T) => void;
  shouldSync: (profileValue: T | null, selectedValue: T, hasQueryParam: boolean) => boolean;
}

/**
 * Synchronizes profile values with selected values on first load.
 * Prevents overwriting user selections if they've already made changes.
 * 
 * @param userId - Current user ID (null if not logged in)
 * @param profileLoading - Whether profile is still loading
 * @param queryParamName - Name of the query parameter to check
 * @param options - Configuration for sync behavior
 */
export function useProfileSync<T>(
  userId: string | null,
  profileLoading: boolean,
  queryParamName: string,
  options: ProfileSyncOptions<T>
): void {
  const appliedUserIdRef = useRef<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    // Reset when user logs out
    if (!userId) {
      appliedUserIdRef.current = null;
      return;
    }

    // Already applied for this user
    if (appliedUserIdRef.current === userId) {
      return;
    }

    // Wait for profile to load
    if (profileLoading) {
      return;
    }

    const hasQueryParam = searchParams?.has(queryParamName) ?? false;

    // Check if we should sync
    if (!options.shouldSync(options.profileValue, options.selectedValue, hasQueryParam)) {
      appliedUserIdRef.current = userId;
      return;
    }

    // Apply profile value
    if (options.profileValue !== null) {
      options.setter(options.profileValue);
    }

    appliedUserIdRef.current = userId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    userId,
    profileLoading,
    queryParamName,
    searchParams,
    options.profileValue,
    options.selectedValue,
    // options.shouldSync and options.setter are stable callbacks
  ]);
}
