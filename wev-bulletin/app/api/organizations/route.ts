import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  fetchOrganizationIndex,
  fetchOrganizationFilterOptions,
} from '@/lib/organizations/server-data';
import { parseOrgIndexSearchParams } from '@/lib/organizations/params';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const supabaseAuth = await createServerClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  const {
    page,
    searchQuery,
    sseOnly,
    provinces,
    municipalities,
    orgTypes,
    languages,
    sortBy,
    activityDays,
  } = parseOrgIndexSearchParams(searchParams, Boolean(user));

  try {
    const [result, filterOptions] = await Promise.all([
      fetchOrganizationIndex(
        {
          page,
          searchQuery,
          sseOnly,
          provinces,
          municipalities,
          orgTypes,
          languages,
          userId: user?.id ?? null,
          sortBy,
          activityDays,
        },
        user ? supabaseAuth : undefined,
      ),
      fetchOrganizationFilterOptions(activityDays),
    ]);

    return NextResponse.json({
      orgs: result.orgs,
      total: result.total,
      totalAvailable: result.totalAvailable,
      filterOptions,
    });
  } catch (error) {
    console.error('organizations api unhandled error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
