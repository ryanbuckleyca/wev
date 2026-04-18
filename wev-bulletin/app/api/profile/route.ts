import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth/request-user';
import { unauthorizedResponse } from '@/lib/http-errors';
import { supabaseServer } from '@/lib/supabase-server';
import { WORK_TYPES } from '@/lib/work-types';
import { PROFILE_COLUMNS, type Profile } from '@/lib/supabase/profiles';

const ratedValueSchema = z.object({
  value: z.string(),
  rank: z.number().int().positive().optional().nullable(),
});

const ratedSkillSchema = z.object({
  skill: z.string(),
  rank: z.number().int().positive().optional().nullable(),
});

const profileUpdateSchema = z
  .object({
    full_name: z.string().nullable().optional(),
    bio: z.string().nullable().optional(),
    values: z.array(z.string()).optional(),
    values_rated: z.array(ratedValueSchema).nullable().optional(),
    skills: z.array(z.string()).optional(),
    skills_rated: z.array(ratedSkillSchema).nullable().optional(),
    work_types: z.array(z.enum(WORK_TYPES)).optional(),
    lat: z.number().finite().nullable().optional(),
    lng: z.number().finite().nullable().optional(),
    municipality: z.string().nullable().optional(),
    province: z.string().nullable().optional(),
    location_display_name: z.string().nullable().optional(),
    profile_photo_url: z.string().nullable().optional(),
  })
  .strict();

function applyProfileDefaults(row: any): Profile {
  return {
    ...row,
    values: Array.isArray(row.values) ? row.values : [],
    skills: Array.isArray(row.skills) ? row.skills : [],
    work_types: Array.isArray(row.work_types) ? row.work_types : [],
  } as Profile;
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
    const result = profileUpdateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: `Validation failed: ${result.error.errors.map((e) => e.message).join(', ')}` },
        { status: 400 },
      );
    }

    if (Object.keys(result.data).length === 0) {
      return NextResponse.json({ error: 'No allowed profile fields were provided' }, { status: 400 });
    }

    const updatePayload = {
      ...result.data,
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
