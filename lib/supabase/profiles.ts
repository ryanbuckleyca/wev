import { createClient } from './client';
import { type RatedValue, type RatedSkill } from '@/lib/value-ratings';

export type Profile = {
  id: string;
  full_name: string | null;
  bio: string | null;
  values: string[];
  values_rated: RatedValue[] | null;
  skills: string[];
  skills_rated: RatedSkill[] | null;
  work_types: string[];
  lat: number | null;
  lng: number | null;
  location_display_name: string | null;
  profile_photo_url: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileUpdateData = {
  full_name?: string | null;
  bio?: string | null;
  values?: string[];
  values_rated?: RatedValue[] | null;
  skills?: string[];
  skills_rated?: RatedSkill[] | null;
  work_types?: string[];
  lat?: number | null;
  lng?: number | null;
  location_display_name?: string | null;
  profile_photo_url?: string | null;
};

/**
 * Fetch a user's profile
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = createClient();

  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();

  if (error) {
    if (error.code === 'PGRST116') return null; // no rows found
    console.error('Error fetching profile:', error);
    return null;
  }

  return data as Profile;
}

/**
 * Update a user's profile
 */
export async function updateProfile(userId: string, updates: ProfileUpdateData): Promise<Profile> {
  const supabase = createClient();

  // Match recalculation for user-driven profile edits is handled by the DB trigger on
  // `profiles`, not by calling `/api/matches/calculate-user`.
  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating profile:', error);
    const msg = [error.message, (error as { details?: string }).details]
      .filter(Boolean)
      .join(' — ');
    throw new Error(msg || 'Failed to update profile');
  }

  return data as Profile;
}
