import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { fetchOrganizationIndex } from '@/lib/organizations/server-data';
import { parseOrgIndexSearchParams } from '@/lib/organizations/params';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const supabaseAuth = await createServerClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  const { page, searchQuery, sseOnly, provinces, municipalities, orgTypes, sortBy } =
    parseOrgIndexSearchParams(searchParams, Boolean(user));

  try {
    const result = await fetchOrganizationIndex({
      page,
      searchQuery,
      sseOnly,
      provinces,
      municipalities,
      orgTypes,
      userId: user?.id ?? null,
      sortBy,
    });

    return NextResponse.json({
      orgs: result.orgs,
      total: result.total,
      totalAvailable: result.totalAvailable,
    });
  } catch (error) {
    console.error('organizations api unhandled error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
