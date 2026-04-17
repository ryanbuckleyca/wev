import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth/request-user';
import { unauthorizedResponse } from '@/lib/http-errors';
import { supabaseServer } from '@/lib/supabase-server';

function parseJobId(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getRequestUser();
    if (!auth.ok) {
      return unauthorizedResponse('Not authenticated');
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const jobId = parseJobId(body?.jobId);
    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    const { error } = await supabaseServer
      .from('bookmarks')
      .insert([{ user_id: auth.user.id, job_id: jobId }]);

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to add bookmark' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add bookmark';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getRequestUser();
    if (!auth.ok) {
      return unauthorizedResponse('Not authenticated');
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const jobId = parseJobId(body?.jobId);
    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    const { error } = await supabaseServer
      .from('bookmarks')
      .delete()
      .eq('user_id', auth.user.id)
      .eq('job_id', jobId);

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Failed to remove bookmark' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove bookmark';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
