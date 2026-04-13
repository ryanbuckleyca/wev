import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth/request-user';
import { unauthorizedResponse } from '@/lib/http-errors';
import { logger } from '@/lib/logger';
import { AccountServiceError, updatePasswordForCurrentUser } from '@/lib/account/service';

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getRequestUser();
    if (!auth.ok) {
      logger.warn({ err: auth.authError }, 'Account update: unauthenticated');
      return unauthorizedResponse();
    }

    const body = await request.json().catch(() => ({}));
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    await updatePasswordForCurrentUser({
      currentPassword,
      newPassword,
    });

    return NextResponse.json({ message: 'Password updated successfully' }, { status: 200 });
  } catch (error) {
    if (error instanceof AccountServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    logger.error({ err: error }, 'Account update error');
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}
