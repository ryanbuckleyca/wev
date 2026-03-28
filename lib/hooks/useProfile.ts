import { useEffect, useState, useCallback } from 'react'
import type { Profile, ProfileUpdateData } from '@/lib/supabase/profiles'
import { getProfile, updateProfile } from '@/lib/supabase/profiles'

type UseProfileState = {
  profile: Profile | null
  loading: boolean
  error: string | null
  isUpdating: boolean
}

type UseProfileActions = {
  refresh: () => Promise<void>
  updateProfile: (data: ProfileUpdateData) => Promise<Profile | null>
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
        setState((prev) => ({ ...prev, profile: updated, isUpdating: false }))
        return updated
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update profile'
        setState((prev) => ({
          ...prev,
          error: message,
          isUpdating: false,
        }))
        throw new Error(message)
      }
    },
    [userId]
  )

  return {
    ...state,
    refresh,
    updateProfile: handleUpdateProfile,
  }
}
