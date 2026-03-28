import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { fetchUserRolesFromService } from '@/lib/auth/server-user-roles';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'cache-control': 'no-store, max-age=0, must-revalidate',
};

export async function GET() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ roles: ['user'] }, { status: 401, headers: NO_STORE_HEADERS });
    }

    // Fail-open: if the roles row cannot be read, treat as default user (differs from admin-only routes).
    const loaded = await fetchUserRolesFromService(user.id);
    if (!loaded.ok) {
      return NextResponse.json({ roles: ['user'] }, { headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ roles: loaded.roles }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json({ roles: ['user'] }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
