import { createClient } from './client'

export type Profile = {
  id: string
  full_name: string | null
  bio: string | null
  values: string[]
  skills: string[]
  profile_photo_url: string | null
  created_at: string
  updated_at: string
}

export type ProfileUpdateData = {
  full_name?: string | null
  bio?: string | null
  values?: string[]
  skills?: string[]
  profile_photo_url?: string | null
}

/**
 * Fetch a user's profile
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .limit(1)

  if (error) {
    console.error('Error fetching profile:', error)
    return null
  }

  if (!data || data.length === 0) {
    return null
  }

  const profile = data[0] as Profile
  return {
    ...profile,
    values: profile.values ?? [],
    skills: profile.skills ?? [],
  }
}

/**
 * Update a user's profile
 */
export async function updateProfile(
  userId: string,
  updates: ProfileUpdateData
): Promise<Profile | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single()

  if (error) {
    console.error('Error updating profile:', error)
    return null
  }

  return data
}

/**
 * Upload a profile photo to storage and update the profile with the URL
 */
export async function uploadProfilePhoto(
  userId: string,
  file: File
): Promise<{ url: string; path: string } | null> {
  const supabase = createClient()

  // Validate file type
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image')
  }

  // Validate file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('File size must be less than 5MB')
  }

  // Create a unique file path
  const fileExt = file.name.split('.').pop()
  const filePath = `${userId}/profile-photo-${Date.now()}.${fileExt}`

  // Delete old profile photo if it exists
  try {
    const { data: files } = await supabase.storage
      .from('avatars')
      .list(userId)

    if (files && files.length > 0) {
      const filesToDelete = files.map((f) => `${userId}/${f.name}`)
      await supabase.storage.from('avatars').remove(filesToDelete)
    }
  } catch (err) {
    console.warn('Could not delete old profile photo:', err)
  }

  // Upload new file
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, { upsert: true })

  if (uploadError) {
    console.error('Error uploading file:', uploadError)
    throw uploadError
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from('avatars').getPublicUrl(filePath)

  // Update profile with new photo URL
  await updateProfile(userId, { profile_photo_url: publicUrl })

  return { url: publicUrl, path: filePath }
}
