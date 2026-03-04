import { useEffect, useState, useCallback } from 'react'
import type { Profile, ProfileUpdateData } from '@/lib/supabase/profiles'
import { getProfile, updateProfile, uploadProfilePhoto } from '@/lib/supabase/profiles'

type UseProfileState = {
  profile: Profile | null
  loading: boolean
  error: string | null
  isUpdating: boolean
}

type UseProfileActions = {
  refresh: () => Promise<void>
  updateProfile: (data: ProfileUpdateData) => Promise<Profile | null>
  uploadPhoto: (file: File) => Promise<{ url: string; path: string } | null>
}

export function useProfile(userId: string | undefined): UseProfileState & UseProfileActions {
  const [state, setState] = useState<UseProfileState>({
    profile: null,
    loading: true,
    error: null,
    isUpdating: false,
  })

  const refresh = useCallback(async () => {
    if (!userId) {
      setState((prev) => ({
        ...prev,
        profile: null,
        loading: false,
        error: null,
      }))
      return
    }

    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const profile = await getProfile(userId)
      if (profile) {
        setState((prev) => ({ ...prev, profile, loading: false }))
      } else {
        setState((prev) => ({
          ...prev,
          error: 'Profile not found',
          loading: false,
        }))
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to fetch profile',
        loading: false,
      }))
    }
  }, [userId])

  // Fetch profile on mount
  useEffect(() => {
    refresh()
  }, [refresh])

  const handleUpdateProfile = useCallback(
    async (data: ProfileUpdateData) => {
      if (!userId) return null

      setState((prev) => ({ ...prev, isUpdating: true, error: null }))
      try {
        const updated = await updateProfile(userId, data)
        if (updated) {
          setState((prev) => ({ ...prev, profile: updated, isUpdating: false }))
          // Match recalculation is handled by Supabase database triggers
          // when profiles.values changes — no client-side call needed.
          return updated
        } else {
          setState((prev) => ({
            ...prev,
            error: 'Failed to update profile',
            isUpdating: false,
          }))
          return null
        }
      } catch (err) {
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to update profile',
          isUpdating: false,
        }))
        return null
      }
    },
    [userId]
  )

  const handleUploadPhoto = useCallback(
    async (file: File) => {
      if (!userId) return null

      setState((prev) => ({ ...prev, isUpdating: true, error: null }))
      try {
        const result = await uploadProfilePhoto(userId, file)
        // Refresh profile to get updated photo URL
        await refresh()
        setState((prev) => ({ ...prev, isUpdating: false }))
        return result
      } catch (err) {
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to upload photo',
          isUpdating: false,
        }))
        return null
      }
    },
    [userId, refresh]
  )

  return {
    ...state,
    refresh,
    updateProfile: handleUpdateProfile,
    uploadPhoto: handleUploadPhoto,
  }
}
