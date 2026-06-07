import { createClient } from './client';
import { type RatedValue, type RatedSkill } from '@/lib/value-ratings';
import { type Database } from './database.types';
import { parseCvImportMetadata, type CvImportMetadata } from '@/lib/cv/types';

const PROFILE_COLUMNS =
  'id, full_name, bio, values, values_rated, skills, skills_rated, work_types, lat, lng, municipality, province, location_display_name, profile_photo_url, cv_import, created_at, updated_at' as const;

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
  municipality: string | null;
  province: string | null;
  location_display_name: string | null;
  profile_photo_url: string | null;
  cv_import: CvImportMetadata | null;
  created_at: string;
  updated_at: string;
};

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

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
  municipality?: string | null;
  province?: string | null;
  location_display_name?: string | null;
  profile_photo_url?: string | null;
  cv_import?: CvImportMetadata | null;
};

/**
 * Coalesce nullable DB fields to safe app defaults.
 */
function normalizeProfileRow(row: ProfileRow): Profile {
  return {
    ...row,
    values: row.values ?? [],
    skills: row.skills ?? [],
    work_types: row.work_types ?? [],
    cv_import: parseCvImportMetadata(row.cv_import),
    values_rated: (row.values_rated as RatedValue[] | null) ?? null,
    skills_rated: (row.skills_rated as RatedSkill[] | null) ?? null,
    created_at: row.created_at ?? new Date(0).toISOString(),
    updated_at: row.updated_at ?? new Date(0).toISOString(),
  };
}

/**
 * Create a blank profile for a user. Internal — called by getProfile when no row exists.
 */
async function createProfile(userId: string): Promise<Profile> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'id',
        ignoreDuplicates: false,
      },
    )
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message || 'Failed to create profile');
  }

  return normalizeProfileRow(data as ProfileRow);
}

/**
 * Fetch a user's profile, creating a blank one if it doesn't exist.
 */
export async function getProfile(userId: string): Promise<Profile> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return createProfile(userId);
    console.error('Error fetching profile:', error);
    throw new Error(error.message || 'Failed to fetch profile');
  }

  return normalizeProfileRow(data as ProfileRow);
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
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    console.error('Error updating profile:', error);
    const msg = [error.message, (error as { details?: string }).details]
      .filter(Boolean)
      .join(' — ');
    throw new Error(msg || 'Failed to update profile');
  }

  return normalizeProfileRow(data as ProfileRow);
}
