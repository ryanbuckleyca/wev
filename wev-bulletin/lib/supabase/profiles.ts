import { type RatedValue, type RatedSkill } from '@/lib/value-ratings';

export const PROFILE_COLUMNS =
  'id, full_name, bio, values, values_rated, skills, skills_rated, work_types, lat, lng, municipality, province, location_display_name, profile_photo_url, created_at, updated_at' as const;

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
  municipality?: string | null;
  province?: string | null;
  location_display_name?: string | null;
  profile_photo_url?: string | null;
};

type ProfileApiResponse = {
  profile?: Profile;
  error?: string;
};

async function parseProfileResponse(response: Response): Promise<Profile> {
  const payload = (await response.json().catch(() => ({}))) as ProfileApiResponse;

  if (!response.ok || !payload.profile) {
    throw new Error(payload.error || 'Profile request failed');
  }

  return payload.profile;
}

/**
 * Fetch a user's profile, creating a blank one if it doesn't exist.
 */
export async function getProfile(userId: string): Promise<Profile> {
  // API resolves profile identity from the authenticated request.
  // userId is retained for call-site compatibility and as a guard.
  if (!userId) {
    throw new Error('Not authenticated');
  }

  const response = await fetch('/api/profile', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'cache-control': 'no-store',
    },
  });

  return parseProfileResponse(response);
}

/**
 * Update a user's profile
 */
export async function updateProfile(userId: string, updates: ProfileUpdateData): Promise<Profile> {
  if (!userId) {
    throw new Error('Not authenticated');
  }

  const response = await fetch('/api/profile', {
    method: 'PATCH',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(updates),
  });

  return parseProfileResponse(response);
}
