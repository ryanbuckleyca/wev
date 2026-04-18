import { NextRequest, NextResponse } from 'next/server';
 
export const dynamic = 'force-dynamic';
import { getRequestUser } from '@/lib/auth/request-user';
import { unauthorizedResponse } from '@/lib/http-errors';
import { logger } from '@/lib/logger';
import { AccountServiceError, updatePasswordForCurrentUser } from '@/lib/account/service';
import { UpdatePasswordSchema } from '@/lib/schemas/account';

import { ZodError } from 'zod/v3';

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getRequestUser();
    if (!auth.ok) {
      logger.warn({ err: auth.authError }, 'Account update: unauthenticated');
      return unauthorizedResponse();
    }

    const body = await request.json().catch(() => ({}));
    const { currentPassword, newPassword } = UpdatePasswordSchema.parse(body);

    await updatePasswordForCurrentUser({
      currentPassword,
      newPassword,
    });

    return NextResponse.json({ message: 'Password updated successfully' }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message, details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof AccountServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    logger.error({ err: error }, 'Account update error');
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}
