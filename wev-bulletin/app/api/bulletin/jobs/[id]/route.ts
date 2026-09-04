import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';
import { requireAdminResponse } from '@/lib/auth/require-admin';
import { BULLETIN_CACHE_TAG } from '@/lib/bulletin/server-data';
import { resolveJobIsSse } from '@/lib/bulletin/job-sse';

export const dynamic = 'force-dynamic';

const BULLETIN_REVALIDATE_PATHS = ['/en', '/fr', '/en/jobs', '/fr/jobs', '/fr/emplois'] as const;

function revalidateBulletinPaths() {
  for (const path of BULLETIN_REVALIDATE_PATHS) {
    revalidatePath(path, 'page');
  }
}

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

    let nextIsSse = isSse;
    if (isSse) {
      const { data: jobRow, error: jobError } = await supabase
        .from('jobs')
        .select('id, organization_id, organizations(is_sse)')
        .eq('id', id)
        .single();

      if (jobError || !jobRow) {
        return NextResponse.json(
          { error: jobError?.message ?? 'Job not found' },
          { status: jobError ? 500 : 404 },
        );
      }

      const orgEmbed = jobRow.organizations as
        | { is_sse: boolean | null }
        | { is_sse: boolean | null }[]
        | null;
      const orgIsSse = Array.isArray(orgEmbed)
        ? (orgEmbed[0]?.is_sse ?? null)
        : (orgEmbed?.is_sse ?? null);
      const resolved = resolveJobIsSse(true, orgIsSse);
      if (resolved !== true) {
        return NextResponse.json(
          {
            error:
              'Job cannot be marked SSE unless the linked organization is SSE',
          },
          { status: 400 },
        );
      }
      nextIsSse = true;
    }

    const { data, error } = await supabase
      .from('jobs')
      .update({ is_sse: nextIsSse })
      .eq('id', id)
      .select('id, is_sse')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidateTag(BULLETIN_CACHE_TAG, 'default');
    revalidateBulletinPaths();

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update job';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
