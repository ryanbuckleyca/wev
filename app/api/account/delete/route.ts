import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth/request-user';
import { unauthorizedResponse } from '@/lib/http-errors';
import { logger } from '@/lib/logger';
import { getSupabaseServer } from '@/lib/supabase-server';

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getRequestUser();
    if (!auth.ok) {
      logger.warn({ err: auth.authError }, 'Account delete: unauthenticated');
      return unauthorizedResponse();
    }

    const { user } = auth;
    // Verify password for security
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { error: 'Password required for account deletion' },
        { status: 400 },
      );
    }

    // Use admin client for deletion operations
    const adminSupabase = getSupabaseServer();
    const userId = user.id;

    // Delete user data in correct order (manual cleanup for tables without CASCADE)

    // 1. Delete from tables without CASCADE (must be done manually)
    await adminSupabase.from('profiles').delete().eq('id', userId);

    await adminSupabase.from('user_roles').delete().eq('user_id', userId);

    // 2. Tables with CASCADE will be automatically cleaned up:
    // - bookmarks (ON DELETE CASCADE)
    // - job_matches (ON DELETE CASCADE)

    // 3. Finally, delete the auth user (this triggers CASCADE deletes)
    const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(userId);

    if (deleteError) {
      logger.error({ err: deleteError, userId }, 'Account delete: auth.admin.deleteUser failed');
      return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
    }

    logger.info({ userId, at: new Date().toISOString() }, 'Account deleted');

    return NextResponse.json({ message: 'Account successfully deleted' }, { status: 200 });
  } catch (error) {
    logger.error({ err: error }, 'Account deletion error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
