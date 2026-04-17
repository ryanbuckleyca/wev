import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth/request-user';
import { fetchUserRolesFromService } from '@/lib/auth/server-user-roles';

export const dynamic = 'force-dynamic';

type SessionUser = {
  id: string;
  email: string | null;
};

const NO_STORE_HEADERS = {
  'cache-control': 'no-store, max-age=0, must-revalidate',
};

export async function GET() {
  try {
    const auth = await getRequestUser();

    if (!auth.ok) {
      return NextResponse.json(
        {
          user: null,
          roles: ['user'],
        },
        { headers: NO_STORE_HEADERS },
      );
    }

    const user: SessionUser = {
      id: auth.user.id,
      email: auth.user.email ?? null,
    };

    const rolesResult = await fetchUserRolesFromService(auth.user.id);
    const roles = rolesResult.ok ? rolesResult.roles : ['user'];

    return NextResponse.json({ user, roles }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      {
        user: null,
        roles: ['user'],
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
