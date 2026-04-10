import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth/request-user';
import { unauthorizedResponse } from '@/lib/http-errors';
import { logger } from '@/lib/logger';
import { AccountServiceError, deleteAccountForCurrentUser } from '@/lib/account/service';

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getRequestUser();
    if (!auth.ok) {
      logger.warn({ err: auth.authError }, 'Account delete: unauthenticated');
      return unauthorizedResponse();
    }

    const { user } = auth;
    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === 'string' ? body.password : '';

    // Profiles, roles, bookmarks, and matches already cascade from auth.users,
    // so a verified auth delete keeps the flow both simpler and safer.
    await deleteAccountForCurrentUser({
      password,
      userEmail: user.email,
      userId: user.id,
    });

    logger.info({ userId: user.id, at: new Date().toISOString() }, 'Account deleted');

    return NextResponse.json({ message: 'Account successfully deleted' }, { status: 200 });
  } catch (error) {
    if (error instanceof AccountServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    logger.error({ err: error }, 'Account deletion error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
