'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Profile, ProfileUpdateData } from '@/lib/supabase/profiles';
import { getProfile, updateProfile } from '@/lib/supabase/profiles';
import { useAuth } from '@/contexts/AuthContext';

interface ProfileContextValue {
  profile: Profile | null;
  loading: boolean;
  isUpdating: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateProfile: (data: ProfileUpdateData) => Promise<Profile>;
}

const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  loading: true,
  isUpdating: false,
  error: null,
  refresh: async () => {},
  updateProfile: async () => {
    throw new Error('ProfileContext not mounted');
  },
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setError(null);
      // Reset isUpdating in case a logout races with an in-flight update.
      setIsUpdating(false);
      setLoading(false);
      return;
    }
    console.debug('[ProfileContext] refresh called', { userId });
    setLoading(true);
    setError(null);
    try {
      const data = await getProfile(userId);
      setProfile(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch profile');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Fetch when auth resolves or user changes.
  useEffect(() => {
    if (authLoading) return;
    refresh();
  }, [authLoading, refresh]);

  const handleUpdateProfile = useCallback(
    async (data: ProfileUpdateData): Promise<Profile> => {
      if (!userId) throw new Error('Not authenticated');
      setIsUpdating(true);
      try {
        const updated = await updateProfile(userId, data);
        setProfile(updated);
        return updated;
      } finally {
        setIsUpdating(false);
      }
    },
    [userId],
  );

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      loading,
      isUpdating,
      error,
      refresh,
      updateProfile: handleUpdateProfile,
    }),
    [profile, loading, isUpdating, error, refresh, handleUpdateProfile],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  return useContext(ProfileContext);
}
