import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth/request-user';
import { unauthorizedResponse } from '@/lib/http-errors';
import { supabaseServer } from '@/lib/supabase-server';

const PROFILE_COLUMNS =
  'id, full_name, bio, values, values_rated, skills, skills_rated, work_types, lat, lng, municipality, province, location_display_name, profile_photo_url, created_at, updated_at' as const;

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

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const updatePayload = {
      ...body,
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
