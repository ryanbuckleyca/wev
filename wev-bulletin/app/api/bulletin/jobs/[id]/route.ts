import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';
import { requireAdminResponse } from '@/lib/auth/require-admin';
import { BULLETIN_CACHE_TAG } from '@/lib/bulletin/server-data';

export const dynamic = 'force-dynamic';

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireAdminResponse();
    if (denied) return denied;

    const { id } = await params;
    const body = await _request.json();
    const isSse = body?.is_sse;

    if (typeof isSse !== 'boolean') {
      return NextResponse.json({ error: 'Body must include is_sse (boolean)' }, { status: 400 });
    }

    const supabase = supabaseServer;
    const { data, error } = await supabase
      .from('jobs')
      .update({ is_sse: isSse })
      .eq('id', id)
      .select('id, is_sse')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidateTag(BULLETIN_CACHE_TAG, 'default');

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update job';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
