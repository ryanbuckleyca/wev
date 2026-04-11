import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth/request-user';
import { fetchUserRolesFromService } from '@/lib/auth/server-user-roles';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'cache-control': 'no-store, max-age=0, must-revalidate',
};

export async function GET() {
  try {
    const auth = await getRequestUser();
    if (!auth.ok) {
      return NextResponse.json({ roles: ['user'] }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const { user } = auth;
    // Fail-open: if the roles row cannot be read, treat as default user (differs from admin-only routes).
    const loaded = await fetchUserRolesFromService(user.id);
    if (!loaded.ok) {
      logger.warn(
        { err: loaded.error, userId: user.id },
        'Roles route: falling back to default user role',
      );
      return NextResponse.json({ roles: ['user'] }, { headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ roles: loaded.roles }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error({ err: error }, 'Roles route failed');
    return NextResponse.json({ roles: ['user'] }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
