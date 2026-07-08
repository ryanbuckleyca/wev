import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { fetchOrganizationIndex } from '@/lib/organizations/server-data';
import { resolveOrgSortBy } from '@/lib/organizations/utils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const supabaseAuth = await createServerClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  const page = parseInt(searchParams.get('page') || '1', 10);
  const searchQuery = searchParams.get('q') || '';
  // nonSse=true means "include non-SSE orgs"; absence means SSE-only (the default view)
  const sseOnly = searchParams.get('nonSse') !== 'true';
  const requestedSortBy = searchParams.get('sortBy') || (user ? 'value-match-desc' : 'org-asc');
  const sortBy = resolveOrgSortBy(requestedSortBy, Boolean(user));

  // Param names match the URL keys used by useOrganizationFilters (province/municipality/type)
  const provinces = searchParams.getAll('province');
  const municipalities = searchParams.getAll('municipality');
  const orgTypes = searchParams.getAll('type');

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
