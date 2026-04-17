import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth/request-user';
import { unauthorizedResponse } from '@/lib/http-errors';
import { supabaseServer } from '@/lib/supabase-server';
import { isWorkType } from '@/lib/work-types';
import type { ProfileUpdateData } from '@/lib/supabase/profiles';

const PROFILE_COLUMNS =
  'id, full_name, bio, values, values_rated, skills, skills_rated, work_types, lat, lng, municipality, province, location_display_name, profile_photo_url, created_at, updated_at' as const;

const ALLOWED_PROFILE_UPDATE_KEYS = [
  'full_name',
  'bio',
  'values',
  'values_rated',
  'skills',
  'skills_rated',
  'work_types',
  'lat',
  'lng',
  'municipality',
  'province',
  'location_display_name',
  'profile_photo_url',
] as const;

const ALLOWED_PROFILE_UPDATE_KEY_SET = new Set<string>(ALLOWED_PROFILE_UPDATE_KEYS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isValidRank(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isRatedValueArray(value: unknown): boolean {
  if (value === null) return true;
  if (!Array.isArray(value)) return false;

  return value.every((item) => {
    if (!isRecord(item) || typeof item.value !== 'string') return false;
    if (!('rank' in item) || item.rank == null) return true;
    return isValidRank(item.rank);
  });
}

function isRatedSkillArray(value: unknown): boolean {
  if (value === null) return true;
  if (!Array.isArray(value)) return false;

  return value.every((item) => {
    if (!isRecord(item) || typeof item.skill !== 'string') return false;
    if (!('rank' in item) || item.rank == null) return true;
    return isValidRank(item.rank);
  });
}

function parseProfileUpdatePayload(body: Record<string, unknown>): {
  ok: true;
  payload: ProfileUpdateData;
} | {
  ok: false;
  error: string;
} {
  const unknownKeys = Object.keys(body).filter((key) => !ALLOWED_PROFILE_UPDATE_KEY_SET.has(key));
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: `Unknown profile field(s): ${unknownKeys.join(', ')}`,
    };
  }

  const payload: ProfileUpdateData = {};

  if ('full_name' in body) {
    if (!isNullableString(body.full_name)) {
      return { ok: false, error: 'full_name must be a string or null' };
    }
    payload.full_name = body.full_name;
  }

  if ('bio' in body) {
    if (!isNullableString(body.bio)) {
      return { ok: false, error: 'bio must be a string or null' };
    }
    payload.bio = body.bio;
  }

  if ('values' in body) {
    if (!isStringArray(body.values)) {
      return { ok: false, error: 'values must be an array of strings' };
    }
    payload.values = body.values;
  }

  if ('skills' in body) {
    if (!isStringArray(body.skills)) {
      return { ok: false, error: 'skills must be an array of strings' };
    }
    payload.skills = body.skills;
  }

  if ('values_rated' in body) {
    if (!isRatedValueArray(body.values_rated)) {
      return { ok: false, error: 'values_rated must be a valid rated values array or null' };
    }
    payload.values_rated = body.values_rated as ProfileUpdateData['values_rated'];
  }

  if ('skills_rated' in body) {
    if (!isRatedSkillArray(body.skills_rated)) {
      return { ok: false, error: 'skills_rated must be a valid rated skills array or null' };
    }
    payload.skills_rated = body.skills_rated as ProfileUpdateData['skills_rated'];
  }

  if ('work_types' in body) {
    if (!isStringArray(body.work_types) || !body.work_types.every(isWorkType)) {
      return {
        ok: false,
        error: 'work_types must be an array containing only remote, hybrid, or office',
      };
    }
    payload.work_types = body.work_types;
  }

  if ('lat' in body) {
    if (!isNullableFiniteNumber(body.lat)) {
      return { ok: false, error: 'lat must be a finite number or null' };
    }
    payload.lat = body.lat;
  }

  if ('lng' in body) {
    if (!isNullableFiniteNumber(body.lng)) {
      return { ok: false, error: 'lng must be a finite number or null' };
    }
    payload.lng = body.lng;
  }

  if ('municipality' in body) {
    if (!isNullableString(body.municipality)) {
      return { ok: false, error: 'municipality must be a string or null' };
    }
    payload.municipality = body.municipality;
  }

  if ('province' in body) {
    if (!isNullableString(body.province)) {
      return { ok: false, error: 'province must be a string or null' };
    }
    payload.province = body.province;
  }

  if ('location_display_name' in body) {
    if (!isNullableString(body.location_display_name)) {
      return { ok: false, error: 'location_display_name must be a string or null' };
    }
    payload.location_display_name = body.location_display_name;
  }

  if ('profile_photo_url' in body) {
    if (!isNullableString(body.profile_photo_url)) {
      return { ok: false, error: 'profile_photo_url must be a string or null' };
    }
    payload.profile_photo_url = body.profile_photo_url;
  }

  if (Object.keys(payload).length === 0) {
    return { ok: false, error: 'No allowed profile fields were provided' };
  }

  return { ok: true, payload };
}

function applyProfileDefaults(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    values: Array.isArray(row.values) ? row.values : [],
    skills: Array.isArray(row.skills) ? row.skills : [],
    work_types: Array.isArray(row.work_types) ? row.work_types : [],
  };
}

async function readOrCreateProfile(userId: string) {
  const { data, error } = await supabaseServer
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (!error && data) {
    return applyProfileDefaults(data as Record<string, unknown>);
  }

  const nowIso = new Date().toISOString();
  const createResult = await supabaseServer
    .from('profiles')
    .upsert(
      {
        id: userId,
        updated_at: nowIso,
      },
      {
        onConflict: 'id',
        ignoreDuplicates: false,
      },
    )
    .select(PROFILE_COLUMNS)
    .single();

  if (createResult.error) {
    throw new Error(createResult.error.message || 'Failed to create profile');
  }

  return applyProfileDefaults(createResult.data as Record<string, unknown>);
}

export async function GET() {
  try {
    const auth = await getRequestUser();
    if (!auth.ok) {
      return unauthorizedResponse('Not authenticated');
    }

    const profile = await readOrCreateProfile(auth.user.id);
    return NextResponse.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch profile';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getRequestUser();
    if (!auth.ok) {
      return unauthorizedResponse('Not authenticated');
    }

    const body = (await request.json().catch(() => null)) as unknown;
    if (!isRecord(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const parsed = parseProfileUpdatePayload(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const updatePayload = {
      ...parsed.payload,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseServer
      .from('profiles')
      .update(updatePayload)
      .eq('id', auth.user.id)
      .select(PROFILE_COLUMNS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to update profile' }, { status: 500 });
    }

    return NextResponse.json({ profile: applyProfileDefaults(data as Record<string, unknown>) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update profile';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
