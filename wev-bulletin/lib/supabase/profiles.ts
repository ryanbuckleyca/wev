import { createClient } from './client';
import { type RatedValue, type RatedSkill, getRankWeight } from '@/lib/value-ratings';
import { type Database } from './database.types';
import { parseCvImportMetadata, type CvImportMetadata } from '@/lib/cv/types';

const PROFILE_COLUMNS =
  'id, full_name, bio, values, values_rated, skills, skills_rated, work_types, preferred_languages, lat, lng, municipality, province, location_display_name, profile_photo_url, cv_import, created_at, updated_at' as const;

export type Profile = {
  id: string;
  full_name: string | null;
  bio: string | null;
  values: string[];
  values_rated: RatedValue[] | null;
  skills: string[];
  skills_rated: RatedSkill[] | null;
  work_types: string[];
  preferred_languages: string[];
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
  preferred_languages?: string[] | null;
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
    preferred_languages: row.preferred_languages ?? [],
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
 * Replace profile_skills junction rows to match the skills array / ratings.
 * Triggers recompute profiles.skill_embedding.
 *
 * Upserts first, then deletes orphans — never delete-all-then-insert — so a
 * failed write cannot leave an empty junction after profiles.skills was updated.
 */
async function syncProfileSkills(
  userId: string,
  skills: string[],
  skillsRated: RatedSkill[] | null | undefined,
): Promise<void> {
  const supabase = createClient();

  if (skills.length === 0) {
    const { error: deleteError } = await supabase
      .from('profile_skills')
      .delete()
      .eq('user_id', userId);
    if (deleteError) {
      throw new Error(deleteError.message || 'Failed to clear profile_skills');
    }
    return;
  }

  const rankByUri = new Map(
    (skillsRated ?? []).filter((r) => r.skill).map((r) => [r.skill, r.rank] as const),
  );
  const rankedCount = [...rankByUri.values()].filter((r) => r != null).length;

  const rows = skills.map((skillId) => ({
    user_id: userId,
    skill_id: skillId,
    score: getRankWeight(rankByUri.get(skillId), Math.max(rankedCount, 1)),
    source: 'profile',
  }));

  const { error: upsertError } = await supabase.from('profile_skills').upsert(rows, {
    onConflict: 'user_id,skill_id',
  });
  if (upsertError) {
    throw new Error(upsertError.message || 'Failed to write profile_skills');
  }

  const { data: existing, error: listError } = await supabase
    .from('profile_skills')
    .select('skill_id')
    .eq('user_id', userId);
  if (listError) {
    throw new Error(listError.message || 'Failed to list profile_skills');
  }

  const keep = new Set(skills);
  const orphans = (existing ?? [])
    .map((row) => row.skill_id)
    .filter((skillId) => !keep.has(skillId));
  if (orphans.length === 0) return;

  const { error: orphanError } = await supabase
    .from('profile_skills')
    .delete()
    .eq('user_id', userId)
    .in('skill_id', orphans);
  if (orphanError) {
    throw new Error(orphanError.message || 'Failed to prune profile_skills');
  }
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

  // Sync after the profiles row commit. Upsert-then-prune (not delete-all) so a
  // failed sync cannot empty the junction while profiles.skills is already new.
  if (updates.skills !== undefined) {
    try {
      await syncProfileSkills(userId, updates.skills, updates.skills_rated);
    } catch (syncErr) {
      console.error('Error syncing profile_skills:', syncErr);
      throw syncErr instanceof Error ? syncErr : new Error('Failed to sync profile_skills');
    }
  }

  return normalizeProfileRow(data as ProfileRow);
}
